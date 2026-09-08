const SUSPICIOUS_THRESHOLD_USD = 50_000

export function analyzeWithdrawals(withdrawals) {
  const largest = withdrawals.reduce((max, w) => (w.amountUSD > (max?.amountUSD ?? -1) ? w : max), null)
  const suspicious = Boolean(largest && largest.amountUSD > SUSPICIOUS_THRESHOLD_USD)
  return {
    verdict: suspicious ? 'SUSPICIOUS' : 'CLEAR',
    threshold: SUSPICIOUS_THRESHOLD_USD,
    largestWithdrawal: largest,
  }
}
