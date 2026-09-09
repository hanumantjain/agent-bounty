import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeWithdrawals } from '../lib/analyze.js'

test('flags a withdrawal above the threshold as SUSPICIOUS', () => {
  const result = analyzeWithdrawals([
    { hash: '0xa', amountUSD: 100, timestamp: 1 },
    { hash: '0xb', amountUSD: 103_117_093, timestamp: 2 },
  ])
  assert.equal(result.verdict, 'SUSPICIOUS')
  assert.equal(result.largestWithdrawal.hash, '0xb')
})

test('reports CLEAR when nothing exceeds the threshold', () => {
  const result = analyzeWithdrawals([
    { hash: '0xa', amountUSD: 100, timestamp: 1 },
    { hash: '0xb', amountUSD: 200, timestamp: 2 },
  ])
  assert.equal(result.verdict, 'CLEAR')
  assert.equal(result.largestWithdrawal.hash, '0xb')
})

test('reports CLEAR with no largest withdrawal on an empty list', () => {
  const result = analyzeWithdrawals([])
  assert.equal(result.verdict, 'CLEAR')
  assert.equal(result.largestWithdrawal, null)
})

test('a value exactly at the threshold is not flagged (strictly greater-than)', () => {
  const result = analyzeWithdrawals([{ hash: '0xa', amountUSD: 50_000, timestamp: 1 }])
  assert.equal(result.verdict, 'CLEAR')
})
