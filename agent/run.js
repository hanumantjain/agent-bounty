import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { buildAndSignPayment } from './lib/hederaPay.js'
import { resolveSpendingLimit } from './lib/ens.js'
import { checkAffordability } from './lib/decide.js'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const NETWORK = `hedera:${process.env.HEDERA_NETWORK || 'testnet'}`
const RESOURCE_PATH = '/api/data/recent-withdrawals'
const PARENT_LABEL = process.env.ENS_PARENT_LABEL
const SPENDING_LIMIT_KEY = process.env.ENS_SPENDING_LIMIT_KEY || 'agent.spending.limit'
const IDENTITY = process.env.ENS_IDENTITY || 'researcher'

async function main() {
  const subname = `${IDENTITY}.${PARENT_LABEL}.eth`
  console.log(`→ agent identity: ${subname}`)

  console.log(`→ probing ${RESOURCE_PATH} for price (no payment)`)
  const probe = await fetch(`${BACKEND_URL}${RESOURCE_PATH}`)
  if (probe.status !== 402) {
    throw new Error(`expected 402, got ${probe.status}: ${await probe.text()}`)
  }
  const { accepts } = await probe.json()
  const requirements = accepts.find((r) => r.network === NETWORK)
  if (!requirements) throw new Error(`no payment option for network ${NETWORK}`)
  console.log(`⚡ price: ${requirements.amount} tinybars`)

  console.log(`→ resolving ENS spending limit for ${subname}...`)
  const ensClient = createPublicClient({ chain: sepolia, transport: http(process.env.ENS_RPC_URL) })
  const limitHbar = await resolveSpendingLimit(ensClient, subname, SPENDING_LIMIT_KEY)
  console.log(`✓ spending limit: ${limitHbar} HBAR`)

  const decision = checkAffordability({ priceTinybars: requirements.amount, limitHbar })

  if (!decision.allowed) {
    console.log(
      `\n✗ BLOCKED: price ${decision.priceHbar} HBAR exceeds ${subname}'s limit of ${decision.limitHbar} HBAR`,
    )
    console.log('  No Hedera transaction was built. No funds moved.')
    return
  }

  console.log(`✓ ALLOWED: price ${decision.priceHbar} HBAR is within ${subname}'s limit of ${decision.limitHbar} HBAR`)

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

  console.log('✓ signed payment transaction, retrying with X-PAYMENT header')

  const paid = await fetch(`${BACKEND_URL}${RESOURCE_PATH}`, {
    headers: { 'X-PAYMENT': Buffer.from(JSON.stringify(paymentPayload)).toString('base64') },
  })
  const body = await paid.json()

  if (paid.status !== 200) {
    console.error('✗ payment failed:', body)
    process.exitCode = 1
    return
  }

  const settlementHeader = paid.headers.get('x-payment-response')
  const settlement = settlementHeader
    ? JSON.parse(Buffer.from(settlementHeader, 'base64').toString('utf8'))
    : null

  console.log('✓ 200 OK — data:', body)
  if (settlement?.transaction) {
    console.log(`✓ settled on Hedera testnet: https://hashscan.io/testnet/transaction/${settlement.transaction}`)
  }
}

main()
  .catch((err) => {
    console.error('✗ agent run failed:', err)
    process.exitCode = 1
  })
  .finally(() => process.exit(process.exitCode ?? 0))
