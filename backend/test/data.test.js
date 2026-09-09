const test = require('node:test')
const assert = require('node:assert/strict')
const app = require('../index.js')

async function withServer(fn) {
  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address()
  try {
    await fn(`http://localhost:${port}`)
  } finally {
    server.close()
  }
}

test('unpaid request returns 402 with payment requirements', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/data/recent-withdrawals`)
    assert.equal(res.status, 402)
    const body = await res.json()
    assert.equal(body.x402Version, 2)
    assert.ok(Array.isArray(body.accepts) && body.accepts.length > 0)
    assert.equal(body.accepts[0].network, `hedera:${process.env.HEDERA_NETWORK || 'testnet'}`)
  })
})

test('malformed X-PAYMENT header is rejected, not treated as valid payment', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/data/recent-withdrawals`, {
      headers: { 'X-PAYMENT': 'not-valid-base64-json-at-all' },
    })
    assert.notEqual(res.status, 200)
  })
})

test('a well-formed but fake payment transaction is rejected by the facilitator, not accepted', async () => {
  await withServer(async (baseUrl) => {
    const fakePayload = {
      x402Version: 2,
      scheme: 'exact',
      network: `hedera:${process.env.HEDERA_NETWORK || 'testnet'}`,
      accepted: {
        scheme: 'exact',
        network: `hedera:${process.env.HEDERA_NETWORK || 'testnet'}`,
        amount: process.env.X402_PRICE_TINYBARS || '1000000',
        asset: '0.0.0',
        payTo: process.env.HEDERA_PAY_TO_ACCOUNT_ID,
        maxTimeoutSeconds: 120,
        extra: { feePayer: '0.0.1' },
      },
      payload: { transaction: Buffer.from('not a real signed transaction').toString('base64') },
    }
    const res = await fetch(`${baseUrl}/api/data/recent-withdrawals`, {
      headers: { 'X-PAYMENT': Buffer.from(JSON.stringify(fakePayload)).toString('base64') },
    })
    assert.notEqual(res.status, 200)
  })
})
