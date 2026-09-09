// Registry of task types this agent knows how to do. A bounty's on-chain `taskType` string is
// looked up here before anything else — an unrecognized type is a real "I can't do this work"
// decision, made before the agent ever claims the bounty, exactly like the spending-limit check.
export const TASK_TYPES = {
  'withdrawal-anomaly': {
    label: 'Detect suspicious withdrawals',
    entity: 'withdraws',
  },
  'deposit-anomaly': {
    label: 'Detect unusually large deposits',
    entity: 'deposits',
  },
  'borrow-anomaly': {
    label: 'Detect unusually large borrows',
    entity: 'borrows',
  },
  'repay-anomaly': {
    label: 'Detect unusually large repayments',
    entity: 'repays',
  },
  'liquidation-anomaly': {
    label: 'Detect large liquidations',
    entity: 'liquidates',
  },
}

export function getTaskDefinition(taskType) {
  return TASK_TYPES[taskType] ?? null
}
