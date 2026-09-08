import { createPublicClient, http as viemHttp, toHex } from 'viem'
import { sepolia } from 'viem/chains'
import { buildAndSignPayment } from './hederaPay.js'
import { resolveSpendingLimit } from './ens.js'
import { checkAffordability } from './decide.js'
import { analyzeWithdrawals } from './analyze.js'
import { makeHederaEvmClients, discoverLatestOpenBounty, submitAnswer } from './bountyEscrow.js'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const NETWORK = `hedera:${process.env.HEDERA_NETWORK || 'testnet'}`
const RESOURCE_PATH = '/api/data/recent-withdrawals'
const PARENT_LABEL = process.env.ENS_PARENT_LABEL
const SPENDING_LIMIT_KEY = process.env.ENS_SPENDING_LIMIT_KEY || 'agent.spending.limit'
const BOUNTY_CONTRACT_ADDRESS = process.env.BOUNTY_CONTRACT_ADDRESS

export async function runAgent({ identity, onStep = () => {} }) {
  const subname = `${identity}.${PARENT_LABEL}.eth`
  onStep('identity', { subname })

  const { account, publicClient: hederaEvm, walletClient } = makeHederaEvmClients()

  onStep('discover', { contract: BOUNTY_CONTRACT_ADDRESS })
  const found = await discoverLatestOpenBounty(hederaEvm, BOUNTY_CONTRACT_ADDRESS)
  if (!found) {
    onStep('no-bounty', {})
    return { outcome: 'no-bounty' }
  }
  onStep('bounty-found', found)

  onStep('probe-price', { path: RESOURCE_PATH })
  const probe = await fetch(`${BACKEND_URL}${RESOURCE_PATH}`)
  if (probe.status !== 402) throw new Error(`expected 402, got ${probe.status}: ${await probe.text()}`)
  const { accepts } = await probe.json()
  const requirements = accepts.find((r) => r.network === NETWORK)
  if (!requirements) throw new Error(`no payment option for network ${NETWORK}`)
  onStep('price', { priceTinybars: requirements.amount })

  onStep('resolve-ens', { subname, key: SPENDING_LIMIT_KEY })
  const ensClient = createPublicClient({ chain: sepolia, transport: viemHttp(process.env.ENS_RPC_URL) })
  const limitHbar = await resolveSpendingLimit(ensClient, subname, SPENDING_LIMIT_KEY)
  onStep('spending-limit', { limitHbar })

  const decision = checkAffordability({ priceTinybars: requirements.amount, limitHbar })
  if (!decision.allowed) {
    onStep('blocked', decision)
    return { outcome: 'blocked', decision }
  }
  onStep('allowed', decision)

  const transaction = await buildAndSignPayment(
    {
      amountTinybars: Number(requirements.amount),
      payToAccountId: requirements.payTo,
      feePayerAccountId: requirements.extra.feePayer,
      network: process.env.HEDERA_NETWORK || 'testnet',
    },
    {
      accountId: process.env.AGENT_HEDERA_ACCOUNT_ID,
      privateKey: process.env.AGENT_HEDERA_PRIVATE_KEY,
      keyType: process.env.AGENT_HEDERA_KEY_TYPE || 'ED25519',
    },
  )

  const paymentPayload = {
    x402Version: 2,
    scheme: 'exact',
    network: NETWORK,
    accepted: requirements,
    payload: { transaction },
  }

  onStep('paying', {})
  const paid = await fetch(`${BACKEND_URL}${RESOURCE_PATH}`, {
    headers: { 'X-PAYMENT': Buffer.from(JSON.stringify(paymentPayload)).toString('base64') },
  })
  const body = await paid.json()
  if (paid.status !== 200) {
    onStep('payment-failed', body)
    return { outcome: 'payment-failed', body }
  }

  const settlementHeader = paid.headers.get('x-payment-response')
  const settlement = settlementHeader
    ? JSON.parse(Buffer.from(settlementHeader, 'base64').toString('utf8'))
    : null
  onStep('paid', { settlement, data: body })

  const analysis = analyzeWithdrawals(body.withdrawals)
  onStep('analysis', analysis)

  const answerHex = toHex(JSON.stringify(analysis))
  const submitTxHash = await submitAnswer({
    walletClient,
    publicClient: hederaEvm,
    contractAddress: BOUNTY_CONTRACT_ADDRESS,
    account,
    taskId: found.taskId,
    answerHex,
  })
  onStep('submitted', { taskId: found.taskId, submitTxHash })

  return {
    outcome: 'submitted',
    taskId: found.taskId,
    analysis,
    settlement,
    submitTxHash,
  }
}
