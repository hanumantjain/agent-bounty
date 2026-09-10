const TINYBARS_PER_HBAR = 100_000_000

function short(value: unknown): string {
  const s = String(value ?? '')
  return s.length > 12 ? `${s.slice(0, 10)}…` : s
}

function hbar(tinybars: unknown): string {
  const n = Number(tinybars)
  return Number.isFinite(n) ? (n / TINYBARS_PER_HBAR).toString() : String(tinybars)
}

/**
 * Turns one raw agent/verifier step event into a self-contained, plain-English sentence,
 * using only the fields that step's own payload actually carries — real numbers (prices,
 * limits, sample sizes, tx hashes) instead of a generic label, so "why" is visible at a
 * glance without cross-referencing other log entries.
 */
export function describeStep(step: string, data: Record<string, unknown>): string {
  switch (step) {
    case 'identity':
      return `Resolved on-chain identity: ${data.subname}`
    case 'discover':
      return `Connected to the bounty contract at ${short(data.contract)}`
    case 'no-bounty':
      return 'No open bounties exist right now'
    case 'bounties-found': {
      const count = Number(data.count)
      return `Found ${count} open bount${count === 1 ? 'y' : 'ies'} to consider`
    }
    case 'resolve-ens':
      return `Reading ENSv2 policy "${data.key}" for ${data.subname}`
    case 'spending-limit':
      return `Spending limit resolved: ${data.limitHbar} HBAR`
    case 'considering':
      return `Considering a "${data.taskType}" bounty`
    case 'skip-unsupported-task':
      return `Skipped — doesn't know how to handle "${data.taskType}" tasks`
    case 'task-recognized':
      return `Recognized the task: ${data.label}`
    case 'probe-price':
      return `Asking the price for ${data.desiredFirst} records per protocol`
    case 'price':
      return `Price quoted: ${hbar(data.priceTinybars)} HBAR for ${data.desiredFirst} records per protocol`
    case 'allowed':
      return `Affordable — ${data.priceHbar} HBAR fits within its ${data.limitHbar} HBAR limit, buying ${data.desiredFirst} records per protocol`
    case 'skip-blocked':
      return data.reason === 'cannot afford even the minimum sample size'
        ? `Skipped — even the smallest possible sample would cost more than its ${data.limitHbar} HBAR limit allows`
        : `Skipped — ${data.priceHbar} HBAR exceeds its ${data.limitHbar} HBAR limit`
    case 'claiming':
      return 'Attempting to claim this bounty on-chain'
    case 'skip-claim-failed':
      return 'Skipped — lost the on-chain claim race to another agent'
    case 'claimed':
      return `Claimed the bounty on-chain (tx ${short(data.claimTxHash)})`
    case 'paying':
      return 'Paying for the data via Hedera x402'
    case 'payment-failed':
      return `Payment failed — ${data.error ?? 'the facilitator rejected the transaction'}`
    case 'paid': {
      const items = (data.data as { items?: unknown[] } | undefined)?.items?.length
      const tx = (data.settlement as { transaction?: string } | undefined)?.transaction
      return `Paid and received ${items ?? '—'} records from The Graph (tx ${short(tx)})`
    }
    case 'analysis':
      return `Analysis complete: ${data.verdict} (based on ${data.firstPerProtocol} records per protocol)`
    case 'submitted':
      return `Submitted its answer on-chain (tx ${short(data.submitTxHash)})`
    case 'no-eligible-bounty':
      return 'No open bounty was eligible — every candidate was unsupported or unaffordable'
    case 'error':
      return `Error: ${data.message}`
    // agentbounty.eth's independent verification steps (race auto-verify + manual check)
    case 'submitted-answer':
      return `Reviewing the submitted answer: ${data.verdict}`
    case 'fresh-analysis':
      return `Independent re-check verdict: ${data.verdict}`
    case 'comparison':
      return data.verified ? 'Match confirmed between submitted and fresh analysis' : 'Mismatch found between submitted and fresh analysis'
    case 'released':
      return data.verified
        ? `Approved and paid out (tx ${short(data.hash)})`
        : `Rejected — reward withheld (tx ${short(data.hash)})`
    default:
      return step
  }
}
