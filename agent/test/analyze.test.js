import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { findLargest, judgeAnomaly } from '../lib/analyze.js'

// judgeAnomaly's actual verdict comes from the LLM, so these tests mock fetch rather than
// asserting a fixed threshold boundary that no longer exists.
process.env.OPENAI_API_KEY = 'test-key'

function mockOpenAIResponse(content) {
  return mock.method(global, 'fetch', async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
  }))
}

test('findLargest picks the item with the highest amountUSD', () => {
  const result = findLargest([
    { hash: '0xa', amountUSD: 100, timestamp: 1 },
    { hash: '0xb', amountUSD: 103_117_093, timestamp: 2 },
  ])
  assert.equal(result.hash, '0xb')
})

test('findLargest returns null on an empty list', () => {
  assert.equal(findLargest([]), null)
})

test('judgeAnomaly reports CLEAR with no largest item on an empty list, without calling the LLM', async (t) => {
  const fetchMock = mock.method(global, 'fetch', async () => {
    throw new Error('fetch should not be called for an empty list')
  })
  t.after(() => fetchMock.mock.restore())

  const result = await judgeAnomaly([], { entityLabel: 'withdrawals' })
  assert.equal(result.verdict, 'CLEAR')
  assert.equal(result.largest, null)
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('judgeAnomaly parses a valid LLM response into verdict/largest/reasoning', async (t) => {
  const fetchMock = mockOpenAIResponse(
    JSON.stringify({ verdict: 'SUSPICIOUS', reasoning: 'the $103,117,093 withdrawal is far larger than the rest' }),
  )
  t.after(() => fetchMock.mock.restore())

  const items = [
    { hash: '0xa', amountUSD: 100, timestamp: 1, protocol: 'aave' },
    { hash: '0xb', amountUSD: 103_117_093, timestamp: 2, protocol: 'aave' },
  ]
  const result = await judgeAnomaly(items, { entityLabel: 'withdrawals' })

  assert.equal(result.verdict, 'SUSPICIOUS')
  assert.equal(result.largest.hash, '0xb')
  assert.equal(result.reasoning, 'the $103,117,093 withdrawal is far larger than the rest')
})

test('judgeAnomaly throws on an invalid verdict from the LLM', async (t) => {
  const fetchMock = mockOpenAIResponse(JSON.stringify({ verdict: 'MAYBE', reasoning: 'unsure' }))
  t.after(() => fetchMock.mock.restore())

  const items = [{ hash: '0xa', amountUSD: 100, timestamp: 1, protocol: 'aave' }]
  await assert.rejects(() => judgeAnomaly(items, { entityLabel: 'withdrawals' }), /invalid verdict/)
})

test('judgeAnomaly throws when the LLM response is not parseable JSON', async (t) => {
  const fetchMock = mockOpenAIResponse('not json at all')
  t.after(() => fetchMock.mock.restore())

  const items = [{ hash: '0xa', amountUSD: 100, timestamp: 1, protocol: 'aave' }]
  await assert.rejects(() => judgeAnomaly(items, { entityLabel: 'withdrawals' }), /could not parse/)
})
