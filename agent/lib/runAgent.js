import { createPublicClient, http as viemHttp, toHex } from 'viem'
import { sepolia } from 'viem/chains'
import { buildAndSignPayment, buildAndSignTokenPayment } from './hederaPay.js'
import { resolveSpendingLimit } from './ens.js'
import { checkAffordability } from './decide.js'
import { judgeAnomaly } from './analyze.js'
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
const MIRROR_NODE_URL = process.env.HEDERA_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com'
const TINYBARS_PER_HBAR = 100_000_000
// A demo-sensible ceiling so a very high spending limit doesn't always just buy the max sample
// size — the interesting signal is "how much more can a bigger budget afford," not "everyone
// maxes out."
const FIRST_DEMO_CAP = 20

// A real balance check, not a declared policy — the trust model for the second settlement
// asset is deliberately different from the ENS-declared HBAR spending limit.
async function getTokenBalanceUnits(accountId, tokenId) {
  const res = await fetch(`${MIRROR_NODE_URL}/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`)
  if (!res.ok) return 0
  const body = await res.json()
  const entry = body.tokens?.find((t) => t.token_id === tokenId)
  return entry ? Number(entry.balance) : 0
}

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

  // Pricing is per-item, not per-bounty, so it's fetched once — same as the spending limit —
  // and used to work out how much data this identity can actually afford, rather than always
  // asking for a hardcoded amount.
  const pricing = await fetch(`${BACKEND_URL}/api/data/pricing`).then((r) => r.json())
  const maxAffordableFirst = Math.floor(
    (limitHbar * TINYBARS_PER_HBAR) / (pricing.pricePerItemTinybars * pricing.protocolCount),
  )

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

    // Second part of "can I do this work?": can this identity afford it — and if so, how much
    // data can it actually buy? Decided before claiming, so a claim is never made on a bounty
    // the agent then has to walk away from. Price is per-item, not flat, so a bigger spending
    // limit genuinely buys a deeper sample, not just a yes/no.
    if (maxAffordableFirst < pricing.minFirst) {
      onStep('skip-blocked', {
        taskId,
        allowed: false,
        reason: 'cannot afford even the minimum sample size',
        limitHbar,
        pricePerItemTinybars: pricing.pricePerItemTinybars,
        protocolCount: pricing.protocolCount,
      })
      continue
    }
    const desiredFirst = Math.min(maxAffordableFirst, pricing.maxFirst, FIRST_DEMO_CAP)
    const resourcePath = `/api/data/recent-activity?entity=${task.entity}&first=${desiredFirst}`

    onStep('probe-price', { taskId, path: resourcePath, desiredFirst })
    const probe = await fetch(`${BACKEND_URL}${resourcePath}`)
    if (probe.status !== 402) throw new Error(`expected 402, got ${probe.status}: ${await probe.text()}`)
    const { accepts } = await probe.json()
    const hbarRequirements = accepts.find((r) => r.network === NETWORK && r.asset === '0.0.0')
    if (!hbarRequirements) throw new Error(`no HBAR payment option for network ${NETWORK}`)
    onStep('price', { taskId, priceTinybars: hbarRequirements.amount, desiredFirst })

    // Decide which real settlement asset to use. The HTS data-credit token is preferred when
    // this identity's own current balance genuinely covers it — checked live via the mirror
    // node, not a declared policy — since that's a different, equally real trust model from the
    // ENS-declared HBAR spending limit. Falls back to the existing HBAR path otherwise.
    let requirements = hbarRequirements
    let asset = 'HBAR'
    let decision
    const dataCreditToken = pricing.dataCreditToken
    if (dataCreditToken) {
      const tokenRequirements = accepts.find((r) => r.network === NETWORK && r.asset === dataCreditToken.tokenId)
      if (tokenRequirements) {
        const balanceUnits = await getTokenBalanceUnits(creds.accountId, dataCreditToken.tokenId)
        onStep('token-balance', {
          taskId,
          tokenId: dataCreditToken.tokenId,
          balanceUnits,
          priceUnits: Number(tokenRequirements.amount),
        })
        if (balanceUnits >= Number(tokenRequirements.amount)) {
          requirements = tokenRequirements
          asset = 'ADC'
          decision = { allowed: true, asset, balanceUnits, priceUnits: Number(tokenRequirements.amount) }
        }
      }
    }
    if (!decision) {
      const hbarDecision = checkAffordability({ priceTinybars: hbarRequirements.amount, limitHbar })
      decision = { ...hbarDecision, asset }
    }
    if (!decision.allowed) {
      onStep('skip-blocked', { taskId, ...decision })
      continue
    }
    onStep('allowed', { taskId, ...decision, desiredFirst })

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

    const payerCreds = {
      accountId: creds.accountId,
      privateKey: process.env[creds.privateKeyEnvVar],
      keyType: creds.keyType,
    }
    const transaction =
      asset === 'ADC'
        ? await buildAndSignTokenPayment(
            {
              tokenId: requirements.asset,
              amountUnits: Number(requirements.amount),
              payToAccountId: requirements.payTo,
              feePayerAccountId: requirements.extra.feePayer,
              network: process.env.HEDERA_NETWORK || 'testnet',
            },
            payerCreds,
          )
        : await buildAndSignPayment(
            {
              amountTinybars: Number(requirements.amount),
              payToAccountId: requirements.payTo,
              feePayerAccountId: requirements.extra.feePayer,
              network: process.env.HEDERA_NETWORK || 'testnet',
            },
            payerCreds,
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
    onStep('paid', { taskId, asset, settlement, data: body })

    // firstPerProtocol travels with the answer so the independent verifier can re-check
    // against the exact same sample size — otherwise a budget-constrained agent that
    // genuinely only looked at (say) 2 records could be unfairly rejected for not seeing an
    // anomaly outside a window it could never have afforded to look at.
    // hcsAudit travels with the answer too — since it's stored permanently on-chain, this
    // makes the payment's independently-checkable HCS audit record recoverable forever from
    // the bounty itself, not just visible in the live step log at the moment it happened.
    const analysis = {
      ...(await judgeAnomaly(body.items, { entityLabel: task.entity })),
      firstPerProtocol: desiredFirst,
      settlementAsset: asset,
      hcsAudit: settlement?.hcsAudit ?? null,
    }
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
