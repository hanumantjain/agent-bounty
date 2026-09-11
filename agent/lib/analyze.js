import { callOpenAI } from './openai.js'

// Identifying the largest item is a fact, not a judgment call — stays deterministic code, not
// an LLM call. Still needed to populate `largest.hash` for the mismatch check in verifier.js.
export function findLargest(items) {
  return items.reduce((max, w) => (w.amountUSD > (max?.amountUSD ?? -1) ? w : max), null)
}

// Judges whether a list of real, recent items should be flagged SUSPICIOUS — called by both
// runAgent.js (the agent's own answer) and verifier.js (the independent recheck) on their own
// respective data, so the two sides stay methodologically consistent. No fixed dollar cutoff:
// the model reasons over the whole list (patterns, clustering, relative size), not just the
// single largest amount.
export async function judgeAnomaly(items, { entityLabel }) {
  const largest = findLargest(items)
  if (items.length === 0) {
    return { verdict: 'CLEAR', largest: null, reasoning: 'no data available' }
  }

  const listing = items
    .map((i) => `- $${i.amountUSD.toLocaleString()} on ${i.protocol} (tx ${i.hash})`)
    .join('\n')

  const prompt = `Here is the complete list of real, recent ${entityLabel} observed across DeFi lending protocols:
${listing}

Decide whether this activity should be flagged SUSPICIOUS (e.g. an unusually large single transaction, a cluster of large transactions, or a pattern that looks like an exploit, bank run, or forced unwind) or CLEAR (normal activity, nothing unusual). Use your own judgment about what counts as unusual for DeFi lending activity — do not apply any fixed dollar threshold, and consider the whole list, not just the single largest amount.

Respond with ONLY JSON, no other text: {"verdict": "SUSPICIOUS" or "CLEAR", "reasoning": "one sentence citing the specific real number(s) that drove the decision"}`

  const raw = await callOpenAI(prompt, { maxTokens: 300 })

  let parsed
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw)
  } catch {
    throw new Error(`judgeAnomaly: could not parse LLM response as JSON: ${raw}`)
  }

  if (parsed.verdict !== 'SUSPICIOUS' && parsed.verdict !== 'CLEAR') {
    throw new Error(`judgeAnomaly: LLM returned an invalid verdict: ${JSON.stringify(parsed.verdict)}`)
  }

  return { verdict: parsed.verdict, largest, reasoning: parsed.reasoning }
}
