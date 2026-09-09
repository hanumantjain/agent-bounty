import { makeHederaEvmClients, createBounty } from '../lib/bountyEscrow.js'

const BOUNTY_CONTRACT_ADDRESS = process.env.BOUNTY_CONTRACT_ADDRESS
const DESCRIPTION = process.argv[2] || 'Analyze recent protocol activity and determine whether a withdrawal pattern is suspicious'
const REWARD_HBAR = process.argv[3] || '0.05'

async function main() {
  if (!BOUNTY_CONTRACT_ADDRESS) throw new Error('BOUNTY_CONTRACT_ADDRESS not set')
  const { account, publicClient, walletClient } = makeHederaEvmClients()

  console.log(`creator: ${account.address}`)
  console.log(`funding: ${REWARD_HBAR} HBAR`)

  const { taskId, hash } = await createBounty({
    walletClient,
    publicClient,
    contractAddress: BOUNTY_CONTRACT_ADDRESS,
    account,
    description: DESCRIPTION,
    rewardHbar: REWARD_HBAR,
  })

  console.log(`✓ bounty created — tx: ${hash}`)
  console.log(`  taskId: ${taskId}`)
}

main().catch((err) => {
  console.error('createTestBounty failed:', err)
  process.exit(1)
})
