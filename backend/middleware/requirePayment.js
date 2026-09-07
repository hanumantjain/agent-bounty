const { getFeePayer, verify, settle } = require('../lib/facilitator')

const NETWORK = `hedera:${process.env.HEDERA_NETWORK || 'testnet'}`

function requirePayment({ amountTinybars, resource }) {
  return async function (req, res, next) {
    let feePayer
    try {
      feePayer = await getFeePayer(NETWORK)
    } catch (err) {
      return res.status(502).json({ error: `facilitator unavailable: ${err.message}` })
    }

    const paymentRequirements = {
      scheme: 'exact',
      network: NETWORK,
      amount: String(amountTinybars),
      asset: '0.0.0',
      payTo: process.env.HEDERA_PAY_TO_ACCOUNT_ID,
      maxTimeoutSeconds: 120,
      resource,
      extra: { feePayer },
    }

    const paymentHeader = req.get('X-PAYMENT')
    if (!paymentHeader) {
      return res.status(402).json({ x402Version: 2, accepts: [paymentRequirements] })
    }

    let paymentPayload
    try {
      paymentPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'))
    } catch {
      return res.status(400).json({ error: 'invalid X-PAYMENT header' })
    }

    try {
      await verify(paymentPayload, paymentRequirements)
      const settlement = await settle(paymentPayload, paymentRequirements)
      res.set('X-PAYMENT-RESPONSE', Buffer.from(JSON.stringify(settlement)).toString('base64'))
      req.payment = settlement
      next()
    } catch (err) {
      res.status(402).json({ x402Version: 2, error: err.message, accepts: [paymentRequirements] })
    }
  }
}

module.exports = { requirePayment }
