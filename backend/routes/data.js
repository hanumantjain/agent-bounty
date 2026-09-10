const express = require('express')
const { requirePayment } = require('../middleware/requirePayment')
const { fetchRecentEntity, ALLOWED_ENTITIES, getProtocols } = require('../lib/graph')

const router = express.Router()

const PRICE_TINYBARS = process.env.X402_PRICE_TINYBARS || '1000000'
const RESOURCE_PATH = '/api/data/recent-activity'

router.get(
  '/recent-activity',
  requirePayment({ amountTinybars: PRICE_TINYBARS, resource: RESOURCE_PATH }),
  async (req, res) => {
    const entity = req.query.entity || 'withdraws'
    if (!ALLOWED_ENTITIES.has(entity)) {
      return res.status(400).json({ error: `unsupported entity: ${entity}` })
    }
    try {
      const items = await fetchRecentEntity(entity, { first: 10 })
      res.json({
        entity,
        protocols: getProtocols().map((p) => p.name),
        fetchedAt: new Date().toISOString(),
        items,
      })
    } catch (err) {
      res.status(502).json({ error: `failed to fetch live Graph data: ${err.message}` })
    }
  },
)

module.exports = router
