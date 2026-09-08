const fs = require('fs')
const path = require('path')
const { createPublicClient, createWalletClient, http, defineChain } = require('viem')
const { privateKeyToAccount } = require('viem/accounts')

const hederaTestnet = defineChain({
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: [process.env.HEDERA_JSON_RPC_URL || 'https://testnet.hashio.io/api'] } },
})

async function main() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!rawKey) throw new Error('DEPLOYER_PRIVATE_KEY not set')
  const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
  const account = privateKeyToAccount(privateKey)
  const verifierAddress = process.env.VERIFIER_ADDRESS || account.address

  console.log(`deployer: ${account.address}`)
  console.log(`verifier: ${verifierAddress}`)

  const { abi, bytecode } = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'build', 'BountyEscrow.json'), 'utf8'),
  )

  const transport = http(hederaTestnet.rpcUrls.default.http[0])
  const publicClient = createPublicClient({ chain: hederaTestnet, transport })
  const walletClient = createWalletClient({ account, chain: hederaTestnet, transport })

  const hash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [verifierAddress],
  })
  console.log(`deploy tx: ${hash}`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log(`contract address: ${receipt.contractAddress}`)

  fs.writeFileSync(
    path.join(__dirname, '..', 'build', 'deployment.json'),
    JSON.stringify({ address: receipt.contractAddress, verifier: verifierAddress, deployTx: hash }, null, 2),
  )
}

main().catch((err) => {
  console.error('deploy failed:', err)
  process.exit(1)
})
