import { fetchRecentEntityIndependently } from './verifyGraph.js'
import { analyzeAmounts } from './analyze.js'
import { getTaskDefinition } from './tasks.js'
import { makeHederaEvmClients, getBounty, writeAndConfirm, BOUNTY_ESCROW_ABI, BountyStatus } from './bountyEscrow.js'

const BOUNTY_CONTRACT_ADDRESS = process.env.BOUNTY_CONTRACT_ADDRESS

function decodeAnswer(answerHex) {
  return JSON.parse(Buffer.from(answerHex.slice(2), 'hex').toString('utf8'))
}

// Independently re-checks a submitted bounty answer against a fresh Graph query. Read-only —
// never trusts the agent's self-report, and never touches the chain. This is the evidence a
// human reviews before deciding whether to release the reward (see releaseDecision).
export async function checkAnswer(taskId) {
  const { publicClient } = makeHederaEvmClients()

  const bounty = await getBounty(publicClient, BOUNTY_CONTRACT_ADDRESS, taskId)
  if (bounty.status !== BountyStatus.Submitted) {
    throw new Error(`bounty is not in Submitted state (status=${bounty.status})`)
  }

  const task = getTaskDefinition(bounty.taskType)
  if (!task) throw new Error(`unsupported task type: ${bounty.taskType}`)

  const submitted = decodeAnswer(bounty.answer)
  // Re-check against the exact same sample size the agent actually paid for and looked at
  // (embedded in its own answer) — not a fixed default. Otherwise a budget-constrained agent
  // that could only afford a small sample would be unfairly rejected for "missing" an anomaly
  // outside a window it never had the budget to see in the first place.
  const first = submitted.firstPerProtocol ?? 10
  const freshItems = await fetchRecentEntityIndependently(task.entity, { first })
  const freshAnalysis = analyzeAmounts(freshItems)

  const matches =
    submitted.verdict === freshAnalysis.verdict && submitted.largest?.hash === freshAnalysis.largest?.hash

  return { matches, submitted, freshAnalysis }
}

// Releases or withholds the reward — signed by agentbounty.eth's account (the same shared
// AGENT_HEDERA_* account that also creates bounties and deployed the contract; it's the one
// address the contract's immutable `verifier` actually allows to call releaseReward). Used by
// both the manual human-review decision and the race flow's auto-verify.
export async function releaseDecision(taskId, approved) {
  const { account, publicClient, walletClient } = makeHederaEvmClients()

  const hash = await writeAndConfirm(walletClient, publicClient, {
    address: BOUNTY_CONTRACT_ADDRESS,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'releaseReward',
    args: [taskId, approved],
    account,
  })

  return { approved, releaseTxHash: hash }
}

// Convenience wrapper for the CLI: runs the automated check, then acts on its own verdict
// immediately (no human in the loop) — useful for scripted testing, not the dashboard path.
export async function verifyBounty({ taskId, onStep = () => {} }) {
  const { matches, submitted, freshAnalysis } = await checkAnswer(taskId)
  onStep('submitted-answer', submitted)
  onStep('fresh-analysis', freshAnalysis)
  onStep('comparison', { verified: matches })

  const { releaseTxHash } = await releaseDecision(taskId, matches)
  onStep('released', { hash: releaseTxHash, verified: matches })

  return { verified: matches, releaseTxHash, submitted, freshAnalysis }
}
