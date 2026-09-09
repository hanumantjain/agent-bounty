import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkAffordability } from '../lib/decide.js'

test('price below limit is allowed', () => {
  const result = checkAffordability({ priceTinybars: '1000000', limitHbar: 1 })
  assert.equal(result.allowed, true)
  assert.equal(result.priceHbar, 0.01)
})

test('price above limit is blocked', () => {
  const result = checkAffordability({ priceTinybars: '200000000', limitHbar: 1 })
  assert.equal(result.allowed, false)
  assert.equal(result.priceHbar, 2)
})

test('price exactly at the limit is allowed', () => {
  const result = checkAffordability({ priceTinybars: '100000000', limitHbar: 1 })
  assert.equal(result.allowed, true)
})

test('zero spending limit blocks any nonzero price', () => {
  const result = checkAffordability({ priceTinybars: '1', limitHbar: 0 })
  assert.equal(result.allowed, false)
})
