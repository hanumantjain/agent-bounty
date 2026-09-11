const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

// Shared by every LLM call in agent/lib/ — aiExplain.js's reviewer note and analyze.js's
// anomaly judgment. temperature: 0 since analyze.js's call now decides real payouts and should
// be as reproducible as an LLM call can be.
export async function callOpenAI(prompt, { maxTokens = 500 } = {}) {
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
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const body = await res.json()
  if (!res.ok) throw new Error(`OpenAI API error: ${body.error?.message || res.status}`)
  return body.choices[0].message.content.trim()
}
