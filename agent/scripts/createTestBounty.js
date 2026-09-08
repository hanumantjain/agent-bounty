import { keccak256, stringToHex, parseEther } from 'viem'
import { makeHederaEvmClients, BOUNTY_ESCROW_ABI } from '../lib/bountyEscrow.js'

const BOUNTY_CONTRACT_ADDRESS = process.env.BOUNTY_CONTRACT_ADDRESS
const DESCRIPTION = process.argv[2] || 'Analyze recent protocol activity and determine whether a withdrawal pattern is suspicious'
const REWARD_HBAR = process.argv[3] || '0.05'

async function main() {
  if (!BOUNTY_CONTRACT_ADDRESS) throw new Error('BOUNTY_CONTRACT_ADDRESS not set')
  const { account, publicClient, walletClient } = makeHederaEvmClients()

  const taskId = keccak256(stringToHex(`bounty-${Date.now()}`))
  const reward = parseEther(REWARD_HBAR)

  console.log(`creator: ${account.address}`)
  console.log(`taskId: ${taskId}`)
  console.log(`funding: ${REWARD_HBAR} HBAR`)

  const hash = await walletClient.writeContract({
    address: BOUNTY_CONTRACT_ADDRESS,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'createBounty',
    args: [taskId, DESCRIPTION],
    value: reward,
    account,
  })
  await publicClient.waitForTransactionReceipt({ hash })

  console.log(`✓ bounty created — tx: ${hash}`)
  console.log(`  taskId: ${taskId}`)
}

main().catch((err) => {
  console.error('createTestBounty failed:', err)
  process.exit(1)
})
