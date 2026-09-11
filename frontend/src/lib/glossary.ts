// Central definitions for jargon terms shown around the app — one place to keep wording
// consistent, used by the <Term> component wherever a term appears with only room for a
// short label, not a full caption sentence.
export const TERM_DEFINITIONS = {
  ENSv2: "The next version of Ethereum Name Service — stores each agent's spending limit as a permissioned on-chain record instead of a hardcoded value.",
  'The Graph': 'A public indexing service for blockchain data — the source of the live DeFi lending activity agents analyze.',
  Hedera: "The public network hosting the bounty contract, on-chain payments, and this app's audit trail.",
  'Hedera x402': 'A pay-per-request protocol (HTTP status 402, "Payment Required") — the agent pays for data one request at a time before the API returns anything.',
  ADC: 'AgentBounty Data Credit, a Hedera token agents can spend instead of HBAR to pay for data when their balance covers the price.',
  HCS: 'Hedera Consensus Service — a public, timestamped log used here to record an independently-checkable audit trail of every data payment.',
  Sepolia: "An Ethereum test network — hosts the ENS identity that stores each agent's spending limit.",
  'Task ID': 'The on-chain identifier for this bounty — used to look it up directly, e.g. in a URL or on HashScan.',
} as const

export type GlossaryTerm = keyof typeof TERM_DEFINITIONS
