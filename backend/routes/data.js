const express = require('express')
const { requirePayment } = require('../middleware/requirePayment')
const { fetchRecentEntity, ALLOWED_ENTITIES, getProtocols, PRICING, clampFirst, priceForFirst } = require('../lib/graph')

const router = express.Router()

const RESOURCE_PATH = '/api/data/recent-activity'

// Unauthenticated — lets an agent (or anyone) work out what it can afford before probing.
router.get('/pricing', (req, res) => {
  const protocols = getProtocols()
  res.json({
    pricePerItemTinybars: PRICING.pricePerItemTinybars,
    protocolCount: protocols.length,
    protocols: protocols.map((p) => p.name),
    minFirst: PRICING.minFirst,
    maxFirst: PRICING.maxFirst,
  })
})

router.get(
  '/recent-activity',
  requirePayment({ amountTinybars: (req) => priceForFirst(clampFirst(req.query.first)), resource: RESOURCE_PATH }),
  async (req, res) => {
    const entity = req.query.entity || 'withdraws'
    if (!ALLOWED_ENTITIES.has(entity)) {
      return res.status(400).json({ error: `unsupported entity: ${entity}` })
    }
    const first = clampFirst(req.query.first)
    try {
      const items = await fetchRecentEntity(entity, { first })
      res.json({
        entity,
        firstPerProtocol: first,
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
