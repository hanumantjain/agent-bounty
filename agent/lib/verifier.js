import { fetchRecentWithdrawsIndependently } from './verifyGraph.js'
import { analyzeWithdrawals } from './analyze.js'
import { makeHederaEvmClients, getBounty, BOUNTY_ESCROW_ABI, BountyStatus } from './bountyEscrow.js'

const BOUNTY_CONTRACT_ADDRESS = process.env.BOUNTY_CONTRACT_ADDRESS

function decodeAnswer(answerHex) {
  return JSON.parse(Buffer.from(answerHex.slice(2), 'hex').toString('utf8'))
}

// Independently verifies a submitted bounty answer against a fresh Graph query, then
// releases (or withholds) the reward on-chain. Never trusts the agent's self-report.
export async function verifyBounty({ taskId, onStep = () => {} }) {
  const { account, publicClient, walletClient } = makeHederaEvmClients()

  const bounty = await getBounty(publicClient, BOUNTY_CONTRACT_ADDRESS, taskId)
  onStep('bounty', bounty)
  if (bounty.status !== BountyStatus.Submitted) {
    throw new Error(`bounty is not in Submitted state (status=${bounty.status})`)
  }

  const submitted = decodeAnswer(bounty.answer)
  onStep('submitted-answer', submitted)

  onStep('re-querying-graph', {})
  const freshWithdrawals = await fetchRecentWithdrawsIndependently({ first: 10 })
  const freshAnalysis = analyzeWithdrawals(freshWithdrawals)
  onStep('fresh-analysis', freshAnalysis)

  const verified =
    submitted.verdict === freshAnalysis.verdict &&
    submitted.largestWithdrawal?.hash === freshAnalysis.largestWithdrawal?.hash

  onStep('comparison', { verified })

  const hash = await walletClient.writeContract({
    address: BOUNTY_CONTRACT_ADDRESS,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'releaseReward',
    args: [taskId, verified],
    account,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  onStep('released', { hash, verified })

  return { verified, releaseTxHash: hash, submitted, freshAnalysis }
}
