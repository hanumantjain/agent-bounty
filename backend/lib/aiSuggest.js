const { fetchRecentEntity } = require('./graph')

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

// Entity -> real task type, so a suggestion can only ever reference a category the agent
// actually knows how to do (kept in sync with agent/lib/tasks.js's registry by hand, same as
// backend/lib/graph.js's ALLOWED_ENTITIES already is).
const ENTITY_TASK_TYPES = {
  withdraws: 'withdrawal-anomaly',
  deposits: 'deposit-anomaly',
  borrows: 'borrow-anomaly',
  repays: 'repay-anomaly',
  liquidates: 'liquidation-anomaly',
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const body = await res.json()
  if (!res.ok) throw new Error(`OpenAI API error: ${body.error?.message || res.status}`)
  return body.choices[0].message.content.trim()
}

// Finds the single largest real item for one entity across all composed protocols — the same
// "largest recent amount" signal the agent itself flags on, just used here to ground a
// suggestion instead of a verdict.
function largestOf(items) {
  if (items.length === 0) return null
  return items.reduce((max, item) => (item.amountUSD > max.amountUSD ? item : max))
}

// Grounds every suggestion in real, freshly-fetched subgraph data — the model is only ever
// asked to phrase what's already true, never to invent an amount or protocol.
async function getSuggestions() {
  const entities = Object.keys(ENTITY_TASK_TYPES)
  const signals = await Promise.all(
    entities.map(async (entity) => {
      try {
        const items = await fetchRecentEntity(entity, { first: 5 })
        return { entity, largest: largestOf(items) }
      } catch {
        return { entity, largest: null }
      }
    }),
  )

  const realFindings = signals.filter((s) => s.largest)
  if (realFindings.length === 0) return []

  const summary = realFindings
    .map(
      (s) =>
        `- ${ENTITY_TASK_TYPES[s.entity]}: a real $${s.largest.amountUSD.toLocaleString()} ${s.entity.slice(0, -1)} just happened on ${s.largest.protocol}`,
    )
    .join('\n')

  const validTaskTypes = realFindings.map((s) => ENTITY_TASK_TYPES[s.entity])

  const prompt = `Here is real, live activity just observed across DeFi lending protocols (Aave V3, Compound III, Morpho Aave V3):
${summary}

Suggest up to 3 specific, compelling bounty ideas a user could post right now, each based on one of the real findings above. Respond with ONLY a JSON array, no other text, each item shaped exactly as:
{"taskType": one of [${validTaskTypes.map((t) => `"${t}"`).join(', ')}], "description": "one sentence referencing the specific real number and protocol above"}`

  let raw
  try {
    raw = await callOpenAI(prompt)
  } catch {
    return []
  }

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
    return parsed.filter((s) => validTaskTypes.includes(s.taskType) && typeof s.description === 'string').slice(0, 3)
  } catch {
    return []
  }
}

module.exports = { getSuggestions }
