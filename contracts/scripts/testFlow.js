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

async function main() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY
  const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
  const account = privateKeyToAccount(privateKey)

  const { address } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'deployment.json'), 'utf8'))
  const { abi } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'BountyEscrow.json'), 'utf8'))

  const transport = http(hederaTestnet.rpcUrls.default.http[0])
  const publicClient = createPublicClient({ chain: hederaTestnet, transport })
  const walletClient = createWalletClient({ account, chain: hederaTestnet, transport })

  const taskId = keccak256(stringToHex(`test-bounty-${Date.now()}`))
  const reward = parseEther('0.01')

  console.log(`1) createBounty(${taskId}) funded with 0.01 HBAR...`)
  const createHash = await walletClient.writeContract({
    address,
    abi,
    functionName: 'createBounty',
    args: [taskId, 'test: detect suspicious withdrawal pattern'],
    value: reward,
  })
  await publicClient.waitForTransactionReceipt({ hash: createHash })
  console.log(`   tx: ${createHash}`)

  const balance = await publicClient.getBalance({ address })
  console.log(`   contract balance: ${balance} wei`)

  console.log('2) submitAnswer...')
  const submitHash = await walletClient.writeContract({
    address,
    abi,
    functionName: 'submitAnswer',
    args: [taskId, toHex('no anomaly detected')],
  })
  await publicClient.waitForTransactionReceipt({ hash: submitHash })
  console.log(`   tx: ${submitHash}`)

  console.log('3) releaseReward(verified=true)...')
  const balanceBefore = await publicClient.getBalance({ address: account.address })
  const releaseHash = await walletClient.writeContract({
    address,
    abi,
    functionName: 'releaseReward',
    args: [taskId, true],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash: releaseHash })
  console.log(`   tx: ${releaseHash}`)

  const balanceAfter = await publicClient.getBalance({ address: account.address })
  console.log(`   agent balance before: ${balanceBefore}, after: ${balanceAfter}`)

  const bounty = await publicClient.readContract({ address, abi, functionName: 'getBounty', args: [taskId] })
  console.log('4) final bounty state:', bounty)
}

main().catch((err) => {
  console.error('test flow failed:', err)
  process.exit(1)
})
