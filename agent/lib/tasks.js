import { SUSPICIOUS_THRESHOLD_USD } from './analyze.js'

const THRESHOLD_LABEL = `$${SUSPICIOUS_THRESHOLD_USD.toLocaleString()}`

// Registry of task types this agent knows how to do. A bounty's on-chain `taskType` string is
// looked up here before anything else — an unrecognized type is a real "I can't do this work"
// decision, made before the agent ever claims the bounty, exactly like the spending-limit check.
// `description` is shown directly in the dashboard so a bounty is understandable at a glance,
// not just a category label.
const ACROSS_PROTOCOLS = 'across multiple live lending protocols (Aave, Compound, and Morpho) using the same standardized query'

export const TASK_TYPES = {
  'withdrawal-anomaly': {
    label: 'Detect suspicious withdrawals',
    entity: 'withdraws',
    description: `Checks the 10 most recent withdrawals ${ACROSS_PROTOCOLS} and flags it SUSPICIOUS if any single one is over ${THRESHOLD_LABEL} — a possible sign of an exploit or a bank run.`,
  },
  'deposit-anomaly': {
    label: 'Detect unusually large deposits',
    entity: 'deposits',
    description: `Checks the 10 most recent deposits ${ACROSS_PROTOCOLS} and flags it SUSPICIOUS if any single one is over ${THRESHOLD_LABEL} — useful for spotting whale activity or unusual capital inflows.`,
  },
  'borrow-anomaly': {
    label: 'Detect unusually large borrows',
    entity: 'borrows',
    description: `Checks the 10 most recent loans taken out ${ACROSS_PROTOCOLS} and flags it SUSPICIOUS if any single borrow is over ${THRESHOLD_LABEL} — large borrows can signal leveraged risk-taking.`,
  },
  'repay-anomaly': {
    label: 'Detect unusually large repayments',
    entity: 'repays',
    description: `Checks the 10 most recent loan repayments ${ACROSS_PROTOCOLS} and flags it SUSPICIOUS if any single one is over ${THRESHOLD_LABEL} — can indicate a large leveraged position being unwound.`,
  },
  'liquidation-anomaly': {
    label: 'Detect large liquidations',
    entity: 'liquidates',
    description: `Checks the 10 most recent forced liquidations ${ACROSS_PROTOCOLS} and flags it SUSPICIOUS if any single one is over ${THRESHOLD_LABEL} — a sign a large leveraged position was forcibly closed.`,
  },
}

export function getTaskDefinition(taskType) {
  return TASK_TYPES[taskType] ?? null
}
