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

/// Same as getBounty, but with the reward field restored from the immutable BountyCreated event
/// once the live value has been zeroed by a payout — see withOriginalReward below for why.
export async function getBountyWithOriginalReward(publicClient, contractAddress, taskId) {
  const bounty = await getBounty(publicClient, contractAddress, taskId)
  if (bounty.status === BountyStatus.None) return bounty
  const latestBlock = await publicClient.getBlockNumber()
  const fromBlock = latestBlock > LOG_WINDOW_BLOCKS ? latestBlock - LOG_WINDOW_BLOCKS : 0n
  const logs = await publicClient.getLogs({
    address: contractAddress,
    event: BOUNTY_CREATED_EVENT,
    args: { taskId },
    fromBlock,
    toBlock: 'latest',
  })
  if (logs.length === 0) return bounty
  return withOriginalReward(bounty, logs[0].args.reward)
}

// Hedera's JSON-RPC relay (Hashio) has been observed to under-estimate gas for writes that
// include a native HBAR transfer (releaseReward) — the pre-flight simulation viem runs inside
// writeContract passes, but the transaction is then mined with too little gas and reverts with
// INSUFFICIENT_GAS. waitForTransactionReceipt does NOT throw on a reverted-but-mined tx, so
// every write here pins a generous explicit gas limit and checks receipt.status itself —
// otherwise a silent on-chain failure would be treated as success by every caller.
export async function writeAndConfirm(walletClient, publicClient, { address, abi, functionName, args, account, value }) {
  // Hashio's own gas estimation under-shoots for these writes (see the module comment above),
  // so every call pins an explicit limit rather than trusting the pre-flight estimate. Bumped
  // from 300_000 after submitAnswer started reverting with INSUFFICIENT_GAS once the answer
  // payload grew slightly (embedding the HCS audit record) — plenty of headroom now, and an
  // unused gas limit doesn't cost extra on Hedera, only gas actually consumed does.
  const hash = await walletClient.writeContract({ address, abi, functionName, args, account, value, gas: 600_000n })
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

// releaseReward() zeroes the contract's stored `reward` the instant it pays out (checks-effects-
// interactions, not a bug) — so a live getBounty() read on a Paid/Rejected bounty always shows 0.
// The BountyCreated event's `reward` field is immutable and never changes, so it's the only
// reliable source for "what was this bounty ever funded for" once it's done. Every discovery
// function below overwrites the live-read reward with the event's original value for display.
function withOriginalReward(bounty, eventReward) {
  return { ...bounty, reward: eventReward }
}

export async function discoverLatestOpenBounty(publicClient, contractAddress) {
  const logs = await recentBountyCreatedLogs(publicClient, contractAddress)
  for (let i = logs.length - 1; i >= 0; i--) {
    const taskId = logs[i].args.taskId
    const bounty = await getBounty(publicClient, contractAddress, taskId)
    if (bounty.status === BountyStatus.Open) {
      return { taskId, bounty: withOriginalReward(bounty, logs[i].args.reward) }
    }
  }
  return null
}

/// Most recently created bounty regardless of status — for dashboard display.
export async function discoverLatestBounty(publicClient, contractAddress) {
  const logs = await recentBountyCreatedLogs(publicClient, contractAddress)
  if (logs.length === 0) return null
  const lastLog = logs[logs.length - 1]
  const taskId = lastLog.args.taskId
  const bounty = await getBounty(publicClient, contractAddress, taskId)
  return { taskId, bounty: withOriginalReward(bounty, lastLog.args.reward) }
}

/// All bounties regardless of status, oldest first — the full on-chain history.
export async function discoverAllBounties(publicClient, contractAddress) {
  const logs = await recentBountyCreatedLogs(publicClient, contractAddress)
  const results = []
  for (let i = 0; i < logs.length; i++) {
    const taskId = logs[i].args.taskId
    const bounty = await getBounty(publicClient, contractAddress, taskId)
    results.push({ taskId, bounty: withOriginalReward(bounty, logs[i].args.reward) })
  }
  return results
}

// Known worker/manager identities, for labeling an on-chain agent address back to its ENS
// subname in the dashboard (the contract itself only ever sees addresses, never names).
const KNOWN_IDENTITIES = ['researcher', 'intern', 'director']

let identityAddressMap = null
function buildIdentityAddressMap() {
  const map = new Map()
  const parentLabel = process.env.ENS_PARENT_LABEL
  for (const label of KNOWN_IDENTITIES) {
    const creds = resolveIdentityCreds(label)
    const rawKey = process.env[creds.privateKeyEnvVar]
    if (!rawKey) continue
    const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
    const ensName = parentLabel ? `${label}.${parentLabel}.eth` : label
    map.set(privateKeyToAccount(privateKey).address.toLowerCase(), ensName)
  }
  const managerKey = process.env.AGENT_HEDERA_PRIVATE_KEY
  if (managerKey) {
    const privateKey = managerKey.startsWith('0x') ? managerKey : `0x${managerKey}`
    map.set(privateKeyToAccount(privateKey).address.toLowerCase(), parentLabel ? `${parentLabel}.eth` : 'agentbounty.eth')
  }
  return map
}

/// Maps an on-chain agent/verifier/creator address back to its full ENS name (e.g.
/// "researcher.agentbounty.eth", "agentbounty.eth"), or null if the address doesn't match any
/// configured identity — the contract itself only ever sees addresses, never names.
export function resolveAgentLabel(address) {
  if (!address) return null
  if (!identityAddressMap) identityAddressMap = buildIdentityAddressMap()
  return identityAddressMap.get(address.toLowerCase()) ?? null
}

/// Every currently-open bounty, oldest first — the agent's real candidate pool, not just
/// the newest one. Oldest-first so the marketplace queue is served fairly.
export async function discoverOpenBounties(publicClient, contractAddress) {
  const all = await discoverAllBounties(publicClient, contractAddress)
  return all.filter(({ bounty }) => bounty.status === BountyStatus.Open)
}
