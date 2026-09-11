import { makeHederaEvmClients, createBounty, createBountyWithToken } from '../lib/bountyEscrow.js'

const BOUNTY_CONTRACT_ADDRESS = process.env.BOUNTY_CONTRACT_ADDRESS
const DESCRIPTION = process.argv[2] || 'Analyze recent protocol activity and determine whether a withdrawal pattern is suspicious'
// For ASSET=HBAR (default), this is an HBAR decimal amount (e.g. "0.05" = 0.05 HBAR).
// For ASSET=ADC, this is ADC's smallest unit (2 decimals) — e.g. "500" = 5.00 ADC — NOT a
// decimal ADC amount, to avoid a second parsing/rounding path on top of the HBAR one.
const REWARD = process.argv[3] || '0.05'
const TASK_TYPE = process.argv[4] || 'withdrawal-anomaly'
const ASSET = (process.argv[5] || 'HBAR').toUpperCase()

async function main() {
  if (!BOUNTY_CONTRACT_ADDRESS) throw new Error('BOUNTY_CONTRACT_ADDRESS not set')
  const { account, publicClient, walletClient } = makeHederaEvmClients()

  console.log(`creator: ${account.address}`)
  console.log(`funding: ${REWARD} ${ASSET === 'ADC' ? 'ADC units (2 decimals)' : 'HBAR'}`)
  console.log(`taskType: ${TASK_TYPE}`)

  const result =
    ASSET === 'ADC'
      ? await createBountyWithToken({
          walletClient,
          publicClient,
          contractAddress: BOUNTY_CONTRACT_ADDRESS,
          account,
          description: DESCRIPTION,
          rewardAdcUnits: Number(REWARD),
          taskType: TASK_TYPE,
        })
      : await createBounty({
          walletClient,
          publicClient,
          contractAddress: BOUNTY_CONTRACT_ADDRESS,
          account,
          description: DESCRIPTION,
          rewardHbar: REWARD,
          taskType: TASK_TYPE,
        })

  console.log(`✓ bounty created — tx: ${result.hash}`)
  console.log(`  taskId: ${result.taskId}`)
}

main().catch((err) => {
  console.error('createTestBounty failed:', err)
  process.exit(1)
})
