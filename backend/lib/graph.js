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

async function fetchRecentEntity(entity, { first = 10 } = {}) {
  if (!ALLOWED_ENTITIES.has(entity)) {
    throw new Error(`unsupported Graph entity: ${entity}`)
  }

  const apiKey = process.env.GRAPH_API_KEY
  const subgraphId = process.env.GRAPH_SUBGRAPH_ID
  if (!apiKey || !subgraphId) {
    throw new Error('GRAPH_API_KEY and GRAPH_SUBGRAPH_ID must be set')
  }

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

module.exports = { fetchRecentEntity, ALLOWED_ENTITIES }
