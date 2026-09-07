const express = require('express')
const { requirePayment } = require('../middleware/requirePayment')

const router = express.Router()

const PRICE_TINYBARS = process.env.X402_PRICE_TINYBARS || '1000000'

router.get(
  '/protocol-stats',
  requirePayment({ amountTinybars: PRICE_TINYBARS, resource: '/api/data/protocol-stats' }),
  (req, res) => {
    res.json({
      stub: true,
      tvlUSD: 1234567,
      note: 'placeholder payload — Phase 2 replaces this with a live Graph query',
    })
  },
)

module.exports = router
