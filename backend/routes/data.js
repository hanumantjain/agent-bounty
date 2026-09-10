const express = require('express')
const { requirePayment } = require('../middleware/requirePayment')
const {
  fetchRecentEntity,
  ALLOWED_ENTITIES,
  getProtocols,
  PRICING,
  clampFirst,
  priceForFirst,
  TOKEN_PRICING,
  priceForFirstInToken,
} = require('../lib/graph')

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
    dataCreditToken: TOKEN_PRICING.tokenId
      ? { tokenId: TOKEN_PRICING.tokenId, symbol: TOKEN_PRICING.tokenSymbol, pricePerItemUnits: TOKEN_PRICING.pricePerItemUnits }
      : null,
  })
})

router.get(
  '/recent-activity',
  requirePayment({
    resource: RESOURCE_PATH,
    buildAccepts: (req) => {
      const first = clampFirst(req.query.first)
      const options = [{ asset: '0.0.0', amount: priceForFirst(first) }]
      if (TOKEN_PRICING.tokenId) {
        options.push({ asset: TOKEN_PRICING.tokenId, amount: priceForFirstInToken(first) })
      }
      return options
    },
  }),
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
