const fs = require('fs')
const path = require('path')
const { createPublicClient, createWalletClient, http, defineChain, parseEther, keccak256, toHex, stringToHex } = require('viem')
const { privateKeyToAccount } = require('viem/accounts')

const hederaTestnet = defineChain({
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: [process.env.HEDERA_JSON_RPC_URL || 'https://testnet.hashio.io/api'] } },
})

function normalizeKey(raw) {
  return raw.startsWith('0x') ? raw : `0x${raw}`
}

// Hashio's gas estimation has been observed to under-shoot for writes that move native HBAR
// (releaseReward) — a transaction can be mined but revert, and waitForTransactionReceipt does
// NOT throw for that. Every write here pins an explicit gas limit and checks status itself.
async function writeAndConfirm(walletClient, publicClient, { address, abi, functionName, args, value }) {
  const hash = await walletClient.writeContract({ address, abi, functionName, args, value, gas: 300_000n })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted on-chain (tx ${hash})`)
  return hash
}

async function main() {
  const account = privateKeyToAccount(normalizeKey(process.env.DEPLOYER_PRIVATE_KEY))

  const { address } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'deployment.json'), 'utf8'))
  const { abi } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'BountyEscrow.json'), 'utf8'))

  const transport = http(hederaTestnet.rpcUrls.default.http[0])
  const publicClient = createPublicClient({ chain: hederaTestnet, transport })
  const walletClient = createWalletClient({ account, chain: hederaTestnet, transport })

  const taskId = keccak256(stringToHex(`test-bounty-${Date.now()}`))
  const reward = parseEther('0.01')

  console.log(`1) createBounty(${taskId}) funded with 0.01 HBAR...`)
  const createHash = await writeAndConfirm(walletClient, publicClient, {
    address,
    abi,
    functionName: 'createBounty',
    args: [taskId, 'test: detect suspicious withdrawal pattern', 'withdrawal-anomaly'],
    value: reward,
  })
  console.log(`   tx: ${createHash}`)

  const balance = await publicClient.getBalance({ address })
  console.log(`   contract balance: ${balance} wei`)

  console.log('2) claimBounty...')
  const claimHash = await writeAndConfirm(walletClient, publicClient, {
    address,
    abi,
    functionName: 'claimBounty',
    args: [taskId],
  })
  console.log(`   tx: ${claimHash}`)

  console.log('2b) claiming the same bounty again (expect revert — already claimed)...')
  try {
    await walletClient.writeContract({ address, abi, functionName: 'claimBounty', args: [taskId] })
    console.error('   ✗ UNEXPECTED: second claim did not revert')
    process.exit(1)
  } catch (err) {
    console.log(`   ✓ reverted as expected: ${err.shortMessage || err.message}`)
  }

  console.log('3) submitAnswer...')
  const submitHash = await writeAndConfirm(walletClient, publicClient, {
    address,
    abi,
    functionName: 'submitAnswer',
    args: [taskId, toHex('no anomaly detected')],
  })
  console.log(`   tx: ${submitHash}`)

  console.log('4) releaseReward(verified=true)...')
  const balanceBefore = await publicClient.getBalance({ address: account.address })
  const releaseHash = await writeAndConfirm(walletClient, publicClient, {
    address,
    abi,
    functionName: 'releaseReward',
    args: [taskId, true],
  })
  console.log(`   tx: ${releaseHash}`)

  const balanceAfter = await publicClient.getBalance({ address: account.address })
  console.log(`   agent balance before: ${balanceBefore}, after: ${balanceAfter}`)

  const bounty = await publicClient.readContract({ address, abi, functionName: 'getBounty', args: [taskId] })
  console.log('5) final bounty state:', bounty)
}

main().catch((err) => {
  console.error('test flow failed:', err)
  process.exit(1)
})
