const SUSPICIOUS_THRESHOLD_USD = 50_000

// Generic anomaly check shared by every task type — "is there an item whose USD amount
// exceeds the threshold?" The caller decides which live data set (withdrawals, deposits, ...)
// this runs against.
export function analyzeAmounts(items) {
  const largest = items.reduce((max, w) => (w.amountUSD > (max?.amountUSD ?? -1) ? w : max), null)
  const suspicious = Boolean(largest && largest.amountUSD > SUSPICIOUS_THRESHOLD_USD)
  return {
    verdict: suspicious ? 'SUSPICIOUS' : 'CLEAR',
    threshold: SUSPICIOUS_THRESHOLD_USD,
    largest,
  }
}
