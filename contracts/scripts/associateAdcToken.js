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

// One-time operational step: the contract has no private key of its own, so it can't sign a
// normal SDK TokenAssociateTransaction. Instead it associates itself from inside a contract
// function (BountyEscrow.sol's associateAdcToken()) — this script just calls that function once,
// right after deploy and before the first ADC-funded bounty (createBountyWithToken would
// otherwise revert, since the contract can't yet hold the token).
async function main() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!rawKey) throw new Error('DEPLOYER_PRIVATE_KEY not set')
  const account = privateKeyToAccount(rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`)

  const { address } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'deployment.json'), 'utf8'))
  const { abi } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'BountyEscrow.json'), 'utf8'))

  const transport = http(hederaTestnet.rpcUrls.default.http[0])
  const publicClient = createPublicClient({ chain: hederaTestnet, transport })
  const walletClient = createWalletClient({ account, chain: hederaTestnet, transport })

  console.log(`associating contract ${address} with the ADC token...`)
  // The first attempt at 300_000 gas reverted after consuming 291_715 — right at the edge of
  // running out mid-call, which surfaces as the inner HTS facade call simply failing (success =
  // false) rather than a clean out-of-gas error. Bumped generously, matching the same lesson
  // already learned for other HTS-touching calls (see agent/lib/bountyEscrow.js's writeAndConfirm).
  const hash = await walletClient.writeContract({ address, abi, functionName: 'associateAdcToken', args: [], gas: 800_000n })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`associateAdcToken reverted on-chain (tx ${hash})`)
  console.log(`✓ associated — tx: ${hash}`)
}

main().catch((err) => {
  console.error('associateAdcToken failed:', err)
  process.exit(1)
})
