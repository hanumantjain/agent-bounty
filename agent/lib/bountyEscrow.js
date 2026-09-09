import { createPublicClient, createWalletClient, http, defineChain, parseAbi, parseAbiItem, parseEther, keccak256, stringToHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export const hederaTestnet = defineChain({
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: [process.env.HEDERA_JSON_RPC_URL || 'https://testnet.hashio.io/api'] } },
})

export const BOUNTY_ESCROW_ABI = parseAbi([
  'function createBounty(bytes32 taskId, string description, string taskType) payable',
  'function claimBounty(bytes32 taskId)',
  'function submitAnswer(bytes32 taskId, bytes answer)',
  'function releaseReward(bytes32 taskId, bool verified)',
  'function getBounty(bytes32 taskId) view returns ((address creator, uint256 reward, string description, string taskType, uint8 status, address agent, bytes answer))',
])

const BOUNTY_CREATED_EVENT = parseAbiItem(
  'event BountyCreated(bytes32 indexed taskId, address indexed creator, uint256 reward, string description, string taskType)',
)

export const BountyStatus = { None: 0, Open: 1, Claimed: 2, Submitted: 3, Paid: 4, Rejected: 5 }
export const BountyStatusNames = ['None', 'Open', 'Claimed', 'Submitted', 'Paid', 'Rejected']

export function makeHederaEvmClients(privateKeyEnvVar = 'AGENT_HEDERA_PRIVATE_KEY') {
  const rawKey = process.env[privateKeyEnvVar]
  const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
  const account = privateKeyToAccount(privateKey)
  const transport = http(hederaTestnet.rpcUrls.default.http[0])
  const publicClient = createPublicClient({ chain: hederaTestnet, transport })
  const walletClient = createWalletClient({ account, chain: hederaTestnet, transport })
  return { account, publicClient, walletClient }
}

export async function getBounty(publicClient, contractAddress, taskId) {
  return publicClient.readContract({
    address: contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'getBounty',
    args: [taskId],
  })
}

export async function createBounty({
  walletClient,
  publicClient,
  contractAddress,
  account,
  description,
  rewardHbar,
  taskType,
}) {
  const taskId = keccak256(stringToHex(`bounty-${Date.now()}`))
  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'createBounty',
    args: [taskId, description, taskType],
    value: parseEther(String(rewardHbar)),
    account,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return { taskId, hash }
}

export async function claimBounty({ walletClient, publicClient, contractAddress, account, taskId }) {
  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'claimBounty',
    args: [taskId],
    account,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

export async function submitAnswer({ walletClient, publicClient, contractAddress, account, taskId, answerHex }) {
  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'submitAnswer',
    args: [taskId, answerHex],
    account,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

async function recentBountyCreatedLogs(publicClient, contractAddress) {
  const latestBlock = await publicClient.getBlockNumber()
  const fromBlock = latestBlock > 5000n ? latestBlock - 5000n : 0n
  return publicClient.getLogs({
    address: contractAddress,
    event: BOUNTY_CREATED_EVENT,
    fromBlock,
    toBlock: 'latest',
  })
}

export async function discoverLatestOpenBounty(publicClient, contractAddress) {
  const logs = await recentBountyCreatedLogs(publicClient, contractAddress)
  for (let i = logs.length - 1; i >= 0; i--) {
    const taskId = logs[i].args.taskId
    const bounty = await getBounty(publicClient, contractAddress, taskId)
    if (bounty.status === BountyStatus.Open) {
      return { taskId, bounty }
    }
  }
  return null
}

/// Most recently created bounty regardless of status — for dashboard display.
export async function discoverLatestBounty(publicClient, contractAddress) {
  const logs = await recentBountyCreatedLogs(publicClient, contractAddress)
  if (logs.length === 0) return null
  const taskId = logs[logs.length - 1].args.taskId
  const bounty = await getBounty(publicClient, contractAddress, taskId)
  return { taskId, bounty }
}
