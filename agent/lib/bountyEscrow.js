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

/// Resolves which Hedera account an identity should sign with. Falls back to the shared
/// AGENT_HEDERA_* trio when an identity has no dedicated account configured — this keeps every
/// existing single-identity flow working unchanged, and lets a "race to claim" between
/// identities become a real race between independent signers once dedicated accounts are set.
export function resolveIdentityCreds(identity) {
  const upper = identity.toUpperCase()
  const prefix = process.env[`${upper}_HEDERA_PRIVATE_KEY`] ? upper : 'AGENT'
  return {
    accountId: process.env[`${prefix}_HEDERA_ACCOUNT_ID`],
    privateKeyEnvVar: `${prefix}_HEDERA_PRIVATE_KEY`,
    keyType: process.env[`${prefix}_HEDERA_KEY_TYPE`] || 'ED25519',
  }
}

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

// Hedera's JSON-RPC relay (Hashio) has been observed to under-estimate gas for writes that
// include a native HBAR transfer (releaseReward) — the pre-flight simulation viem runs inside
// writeContract passes, but the transaction is then mined with too little gas and reverts with
// INSUFFICIENT_GAS. waitForTransactionReceipt does NOT throw on a reverted-but-mined tx, so
// every write here pins a generous explicit gas limit and checks receipt.status itself —
// otherwise a silent on-chain failure would be treated as success by every caller.
export async function writeAndConfirm(walletClient, publicClient, { address, abi, functionName, args, account, value }) {
  const hash = await walletClient.writeContract({ address, abi, functionName, args, account, value, gas: 300_000n })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error(`${functionName} reverted on-chain (tx ${hash})`)
  }
  return hash
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
  const hash = await writeAndConfirm(walletClient, publicClient, {
    address: contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'createBounty',
    args: [taskId, description, taskType],
    value: parseEther(String(rewardHbar)),
    account,
  })
  return { taskId, hash }
}

export async function claimBounty({ walletClient, publicClient, contractAddress, account, taskId }) {
  const hash = await writeAndConfirm(walletClient, publicClient, {
    address: contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'claimBounty',
    args: [taskId],
    account,
  })
  return hash
}

export async function submitAnswer({ walletClient, publicClient, contractAddress, account, taskId, answerHex }) {
  return writeAndConfirm(walletClient, publicClient, {
    address: contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: 'submitAnswer',
    args: [taskId, answerHex],
    account,
  })
}

// Hashio's `eth_getLogs` rejects ranges beyond a fixed block-count cap (empirically confirmed
// on Hedera testnet: 250,000 blocks succeeds, 300,000 fails with "method not supported").
// 200,000 stays safely under that limit while covering many hours of testnet block production —
// wide enough that a bounty doesn't silently fall out of discovery shortly after creation.
const LOG_WINDOW_BLOCKS = 200_000n

async function recentBountyCreatedLogs(publicClient, contractAddress) {
  const latestBlock = await publicClient.getBlockNumber()
  const fromBlock = latestBlock > LOG_WINDOW_BLOCKS ? latestBlock - LOG_WINDOW_BLOCKS : 0n
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

/// All bounties regardless of status, oldest first — the full on-chain history.
export async function discoverAllBounties(publicClient, contractAddress) {
  const logs = await recentBountyCreatedLogs(publicClient, contractAddress)
  const results = []
  for (let i = 0; i < logs.length; i++) {
    const taskId = logs[i].args.taskId
    const bounty = await getBounty(publicClient, contractAddress, taskId)
    results.push({ taskId, bounty })
  }
  return results
}

/// Every currently-open bounty, oldest first — the agent's real candidate pool, not just
/// the newest one. Oldest-first so the marketplace queue is served fairly.
export async function discoverOpenBounties(publicClient, contractAddress) {
  const all = await discoverAllBounties(publicClient, contractAddress)
  return all.filter(({ bounty }) => bounty.status === BountyStatus.Open)
}
