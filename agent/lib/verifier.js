import { fetchRecentEntityIndependently } from './verifyGraph.js'
import { analyzeAmounts } from './analyze.js'
import { getTaskDefinition } from './tasks.js'
import { makeHederaEvmClients, getBounty, BOUNTY_ESCROW_ABI, BountyStatus } from './bountyEscrow.js'

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
  const freshItems = await fetchRecentEntityIndependently(task.entity, { first: 10 })
  const freshAnalysis = analyzeAmounts(freshItems)

  const matches =
    submitted.verdict === freshAnalysis.verdict && submitted.largest?.hash === freshAnalysis.largest?.hash

  return { matches, submitted, freshAnalysis }
}

// Releases or withholds the reward based on an explicit human decision. The contract doesn't
// know a human was involved — this is just the one caller allowed to call releaseReward.
export async function releaseDecision(taskId, approved) {
  const { account, publicClient, walletClient } = makeHederaEvmClients()

  const hash = await walletClient.writeContract({
    address: BOUNTY_CONTRACT_ADDRESS,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'releaseReward',
    args: [taskId, approved],
    account,
  })
  await publicClient.waitForTransactionReceipt({ hash })

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
