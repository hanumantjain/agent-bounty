const express = require('express')
const { requirePayment } = require('../middleware/requirePayment')
const { fetchRecentWithdraws } = require('../lib/graph')

const router = express.Router()

const PRICE_TINYBARS = process.env.X402_PRICE_TINYBARS || '1000000'
const RESOURCE_PATH = '/api/data/recent-withdrawals'

router.get(
  '/recent-withdrawals',
  requirePayment({ amountTinybars: PRICE_TINYBARS, resource: RESOURCE_PATH }),
  async (req, res) => {
    try {
      const withdrawals = await fetchRecentWithdraws({ first: 10 })
      res.json({
        subgraphId: process.env.GRAPH_SUBGRAPH_ID,
        fetchedAt: new Date().toISOString(),
        withdrawals,
      })
    } catch (err) {
      res.status(502).json({ error: `failed to fetch live Graph data: ${err.message}` })
    }
  },
)

module.exports = router
