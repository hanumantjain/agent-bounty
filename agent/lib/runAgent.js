import { createPublicClient, http as viemHttp, toHex } from 'viem'
import { sepolia } from 'viem/chains'
import { buildAndSignPayment } from './hederaPay.js'
import { resolveSpendingLimit } from './ens.js'
import { checkAffordability } from './decide.js'
import { analyzeAmounts } from './analyze.js'
import { getTaskDefinition } from './tasks.js'
import {
  makeHederaEvmClients,
  resolveIdentityCreds,
  discoverOpenBounties,
  getBounty,
  BountyStatus,
  claimBounty,
  submitAnswer,
} from './bountyEscrow.js'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const NETWORK = `hedera:${process.env.HEDERA_NETWORK || 'testnet'}`
const PARENT_LABEL = process.env.ENS_PARENT_LABEL
const SPENDING_LIMIT_KEY = process.env.ENS_SPENDING_LIMIT_KEY || 'agent.spending.limit'
const BOUNTY_CONTRACT_ADDRESS = process.env.BOUNTY_CONTRACT_ADDRESS

export async function runAgent({ identity, taskId: targetTaskId, onStep = () => {} }) {
  const subname = `${identity}.${PARENT_LABEL}.eth`
  onStep('identity', { subname })

  const creds = resolveIdentityCreds(identity)
  const { account, publicClient: hederaEvm, walletClient } = makeHederaEvmClients(creds.privateKeyEnvVar)

  onStep('discover', { contract: BOUNTY_CONTRACT_ADDRESS })
  let candidates
  if (targetTaskId) {
    // Scoped to one specific bounty — used by the "activate this bounty" race, where several
    // identities are each given exactly this taskId and nothing else to consider.
    const bounty = await getBounty(hederaEvm, BOUNTY_CONTRACT_ADDRESS, targetTaskId)
    candidates = bounty.status === BountyStatus.Open ? [{ taskId: targetTaskId, bounty }] : []
  } else {
    candidates = await discoverOpenBounties(hederaEvm, BOUNTY_CONTRACT_ADDRESS)
  }
  if (candidates.length === 0) {
    onStep('no-bounty', {})
    return { outcome: 'no-bounty' }
  }
  onStep('bounties-found', { count: candidates.length })

  // Spending policy is identity-only (not bounty-specific), so it's resolved once up front —
  // every candidate below is checked against the same limit.
  onStep('resolve-ens', { subname, key: SPENDING_LIMIT_KEY })
  const ensClient = createPublicClient({ chain: sepolia, transport: viemHttp(process.env.ENS_RPC_URL) })
  const limitHbar = await resolveSpendingLimit(ensClient, subname, SPENDING_LIMIT_KEY)
  onStep('spending-limit', { limitHbar })

  for (const { taskId, bounty } of candidates) {
    onStep('considering', { taskId, taskType: bounty.taskType })

    // First part of "can I do this work?": does this agent even know how to do this task
    // type? An unrecognized type is a real capability gap — skip straight to the next
    // candidate, no price probe, no claim.
    const task = getTaskDefinition(bounty.taskType)
    if (!task) {
      onStep('skip-unsupported-task', { taskId, taskType: bounty.taskType })
      continue
    }
    onStep('task-recognized', { taskId, taskType: bounty.taskType, label: task.label })

    const resourcePath = `/api/data/recent-activity?entity=${task.entity}`

    // Second part of "can I do this work?": can this identity afford it? Decided before
    // claiming, so a claim is never made on a bounty the agent then has to walk away from.
    onStep('probe-price', { taskId, path: resourcePath })
    const probe = await fetch(`${BACKEND_URL}${resourcePath}`)
    if (probe.status !== 402) throw new Error(`expected 402, got ${probe.status}: ${await probe.text()}`)
    const { accepts } = await probe.json()
    const requirements = accepts.find((r) => r.network === NETWORK)
    if (!requirements) throw new Error(`no payment option for network ${NETWORK}`)
    onStep('price', { taskId, priceTinybars: requirements.amount })

    const decision = checkAffordability({ priceTinybars: requirements.amount, limitHbar })
    if (!decision.allowed) {
      onStep('skip-blocked', { taskId, ...decision })
      continue
    }
    onStep('allowed', { taskId, ...decision })

    // Claim the bounty on-chain now that this identity has decided it can do the work. If a
    // second agent already claimed it in the meantime, this reverts — skip to the next
    // candidate instead of failing the whole run.
    onStep('claiming', { taskId })
    let claimTxHash
    try {
      claimTxHash = await claimBounty({
        walletClient,
        publicClient: hederaEvm,
        contractAddress: BOUNTY_CONTRACT_ADDRESS,
        account,
        taskId,
      })
    } catch (err) {
      onStep('skip-claim-failed', { taskId, error: err.message })
      continue
    }
    onStep('claimed', { taskId, claimTxHash })

    const transaction = await buildAndSignPayment(
      {
        amountTinybars: Number(requirements.amount),
        payToAccountId: requirements.payTo,
        feePayerAccountId: requirements.extra.feePayer,
        network: process.env.HEDERA_NETWORK || 'testnet',
      },
      {
        accountId: creds.accountId,
        privateKey: process.env[creds.privateKeyEnvVar],
        keyType: creds.keyType,
      },
    )

    const paymentPayload = {
      x402Version: 2,
      scheme: 'exact',
      network: NETWORK,
      accepted: requirements,
      payload: { transaction },
    }

    onStep('paying', { taskId })
    const paid = await fetch(`${BACKEND_URL}${resourcePath}`, {
      headers: { 'X-PAYMENT': Buffer.from(JSON.stringify(paymentPayload)).toString('base64') },
    })
    const body = await paid.json()
    if (paid.status !== 200) {
      onStep('payment-failed', { taskId, ...body })
      return { outcome: 'payment-failed', taskId, body }
    }

    const settlementHeader = paid.headers.get('x-payment-response')
    const settlement = settlementHeader
      ? JSON.parse(Buffer.from(settlementHeader, 'base64').toString('utf8'))
      : null
    onStep('paid', { taskId, settlement, data: body })

    const analysis = analyzeAmounts(body.items)
    onStep('analysis', { taskId, ...analysis })

    const answerHex = toHex(JSON.stringify(analysis))
    const submitTxHash = await submitAnswer({
      walletClient,
      publicClient: hederaEvm,
      contractAddress: BOUNTY_CONTRACT_ADDRESS,
      account,
      taskId,
      answerHex,
    })
    onStep('submitted', { taskId, submitTxHash })

    return {
      outcome: 'submitted',
      taskId,
      analysis,
      settlement,
      submitTxHash,
    }
  }

  onStep('no-eligible-bounty', {})
  return { outcome: 'no-eligible-bounty' }
}
