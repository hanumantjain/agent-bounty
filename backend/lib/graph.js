const GATEWAY_URL = process.env.GRAPH_GATEWAY_URL || 'https://gateway.thegraph.com/api'

const WITHDRAWS_QUERY = `
  query RecentWithdraws($first: Int!) {
    withdraws(first: $first, orderBy: timestamp, orderDirection: desc) {
      hash
      amount
      amountUSD
      timestamp
    }
  }
`

async function fetchRecentWithdraws({ first = 10 } = {}) {
  const apiKey = process.env.GRAPH_API_KEY
  const subgraphId = process.env.GRAPH_SUBGRAPH_ID
  if (!apiKey || !subgraphId) {
    throw new Error('GRAPH_API_KEY and GRAPH_SUBGRAPH_ID must be set')
  }

  const res = await fetch(`${GATEWAY_URL}/${apiKey}/subgraphs/id/${subgraphId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: WITHDRAWS_QUERY, variables: { first } }),
  })

  const body = await res.json()
  if (!res.ok || body.errors) {
    throw new Error(`Graph query failed: ${JSON.stringify(body.errors || res.status)}`)
  }

  return body.data.withdraws.map((w) => ({
    hash: w.hash,
    amountUSD: Number(w.amountUSD),
    timestamp: Number(w.timestamp),
  }))
}

module.exports = { fetchRecentWithdraws }
