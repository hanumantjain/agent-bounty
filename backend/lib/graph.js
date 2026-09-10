const GATEWAY_URL = process.env.GRAPH_GATEWAY_URL || 'https://gateway.thegraph.com/api'

// All five entities share the same Messari-standard shape (hash, amount, amountUSD, timestamp).
const ALLOWED_ENTITIES = new Set(['withdraws', 'deposits', 'borrows', 'repays', 'liquidates'])

function buildQuery(entity) {
  return `
    query Recent($first: Int!) {
      ${entity}(first: $first, orderBy: timestamp, orderDirection: desc) {
        hash
        amount
        amountUSD
        timestamp
      }
    }
  `
}

// GRAPH_PROTOCOLS lists every Messari-standardized lending subgraph to query with the exact
// same GraphQL shape — "one query pattern spanning many protocols," not one subgraph with a
// varying entity name. Falls back to the single GRAPH_SUBGRAPH_ID as a one-item list.
function getProtocols() {
  const raw = process.env.GRAPH_PROTOCOLS
  if (!raw) return [{ name: 'default', subgraphId: process.env.GRAPH_SUBGRAPH_ID }]
  return raw.split(',').map((pair) => {
    const [name, subgraphId] = pair.split(':')
    return { name, subgraphId }
  })
}

async function queryProtocol(apiKey, subgraphId, entity, first) {
  const res = await fetch(`${GATEWAY_URL}/${apiKey}/subgraphs/id/${subgraphId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: buildQuery(entity), variables: { first } }),
  })

  const body = await res.json()
  if (!res.ok || body.errors) {
    throw new Error(`Graph query failed: ${JSON.stringify(body.errors || res.status)}`)
  }

  return body.data[entity].map((w) => ({
    hash: w.hash,
    amountUSD: Number(w.amountUSD),
    timestamp: Number(w.timestamp),
  }))
}

async function fetchRecentEntity(entity, { first = 10 } = {}) {
  if (!ALLOWED_ENTITIES.has(entity)) {
    throw new Error(`unsupported Graph entity: ${entity}`)
  }

  const apiKey = process.env.GRAPH_API_KEY
  if (!apiKey) throw new Error('GRAPH_API_KEY must be set')

  const protocols = getProtocols()
  const results = await Promise.all(
    protocols.map(async ({ name, subgraphId }) => {
      const items = await queryProtocol(apiKey, subgraphId, entity, first)
      return items.map((item) => ({ ...item, protocol: name }))
    }),
  )

  return results.flat()
}

// Usage-based pricing: price scales with how much data is actually delivered — records
// requested per protocol, times how many protocols are composed into the answer — rather than
// one flat number charged for every call regardless of what's asked for.
const PRICING = {
  pricePerItemTinybars: Number(process.env.PRICE_PER_ITEM_TINYBARS || '30000'),
  minFirst: 1,
  maxFirst: 50,
  defaultFirst: 10,
}

function clampFirst(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return PRICING.defaultFirst
  return Math.min(Math.max(Math.floor(n), PRICING.minFirst), PRICING.maxFirst)
}

function priceForFirst(first) {
  return PRICING.pricePerItemTinybars * first * getProtocols().length
}

module.exports = { fetchRecentEntity, ALLOWED_ENTITIES, getProtocols, PRICING, clampFirst, priceForFirst }
