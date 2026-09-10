const { getFeePayer, verify, settle } = require('../lib/facilitator')

const NETWORK = `hedera:${process.env.HEDERA_NETWORK || 'testnet'}`

// buildAccepts(req) => [{ asset, amount }, ...] — one or more real settlement options for this
// specific request. Usually just HBAR (asset '0.0.0'), but a resource can offer more than one
// asset (e.g. a second HTS token) so the caller genuinely chooses how to pay, not just whether.
function requirePayment({ buildAccepts, resource }) {
  return async function (req, res, next) {
    let feePayer
    try {
      feePayer = await getFeePayer(NETWORK)
    } catch (err) {
      return res.status(502).json({ error: `facilitator unavailable: ${err.message}` })
    }

    const options = buildAccepts(req)
    const acceptsList = options.map(({ asset, amount }) => ({
      scheme: 'exact',
      network: NETWORK,
      amount: String(amount),
      asset,
      payTo: process.env.HEDERA_PAY_TO_ACCOUNT_ID,
      maxTimeoutSeconds: 120,
      resource,
      extra: { feePayer },
    }))

    const paymentHeader = req.get('X-PAYMENT')
    if (!paymentHeader) {
      return res.status(402).json({ x402Version: 2, accepts: acceptsList })
    }

    let paymentPayload
    try {
      paymentPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'))
    } catch {
      return res.status(400).json({ error: 'invalid X-PAYMENT header' })
    }

    // Which asset the caller actually chose to pay with — but the amount/payTo/etc used to
    // verify and settle always comes from OUR own recomputed requirements for that asset, never
    // trusted from the client's payload.
    const chosenAsset = paymentPayload.accepted?.asset
    const paymentRequirements = acceptsList.find((r) => r.asset === chosenAsset)
    if (!paymentRequirements) {
      return res.status(400).json({ x402Version: 2, error: `unsupported asset: ${chosenAsset}`, accepts: acceptsList })
    }

    try {
      await verify(paymentPayload, paymentRequirements)
      const settlement = await settle(paymentPayload, paymentRequirements)

      // Best-effort: log this settlement to the HCS audit topic for an independently
      // verifiable payment trail. Never let a transient HCS hiccup block the actual paid
      // response — the core payment flow doesn't depend on this extra proof layer.
      try {
        const { submitPaymentAudit } = await import('../../agent/lib/hcsAudit.js')
        settlement.hcsAudit = await submitPaymentAudit({
          resource,
          asset: paymentRequirements.asset,
          amount: paymentRequirements.amount,
          payTo: paymentRequirements.payTo,
          payer: settlement.payer,
          settlementTransaction: settlement.transaction,
          network: NETWORK,
        })
      } catch (err) {
        console.error('HCS audit log failed (non-fatal):', err.message)
      }

      res.set('X-PAYMENT-RESPONSE', Buffer.from(JSON.stringify(settlement)).toString('base64'))
      req.payment = settlement
      next()
    } catch (err) {
      res.status(402).json({ x402Version: 2, error: err.message, accepts: acceptsList })
    }
  }
}

module.exports = { requirePayment }
