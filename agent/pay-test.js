import { buildAndSignPayment } from './lib/hederaPay.js'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001'
const NETWORK = `hedera:${process.env.HEDERA_NETWORK || 'testnet'}`
const RESOURCE_PATH = '/api/data/protocol-stats'

async function main() {
  console.log(`→ requesting ${RESOURCE_PATH} (no payment)`)
  const first = await fetch(`${BACKEND_URL}${RESOURCE_PATH}`)

  if (first.status !== 402) {
    throw new Error(`expected 402, got ${first.status}: ${await first.text()}`)
  }

  const { accepts } = await first.json()
  const requirements = accepts.find((r) => r.network === NETWORK)
  if (!requirements) throw new Error(`no payment option for network ${NETWORK}`)

  console.log(
    `⚡ received 402 — price ${requirements.amount} tinybars, payTo ${requirements.payTo}, feePayer ${requirements.extra.feePayer}`,
  )

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
    headers: {
      'X-PAYMENT': Buffer.from(JSON.stringify(paymentPayload)).toString('base64'),
    },
  })

  const body = await paid.json()

  if (paid.status !== 200) {
    console.error('✗ payment failed:', body)
    process.exit(1)
  }

  const settlementHeader = paid.headers.get('x-payment-response')
  const settlement = settlementHeader
    ? JSON.parse(Buffer.from(settlementHeader, 'base64').toString('utf8'))
    : null

  console.log('✓ 200 OK — data:', body)
  if (settlement?.transaction) {
    console.log(`✓ settled on Hedera testnet: https://hashscan.io/testnet/transaction/${settlement.transaction}`)
  } else {
    console.log('settlement response:', settlement)
  }
}

main()
  .catch((err) => {
    console.error('✗ agent run failed:', err)
    process.exitCode = 1
  })
  .finally(() => process.exit(process.exitCode ?? 0))
