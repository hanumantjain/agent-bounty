// Proves Enhanced Access Control delegation is real, with two genuinely different accounts:
//   1. The admin grants a role scoped to ONE text key (agent.spending.limit) on researcher's
//      resolver to a separate "policy operator" account — an address that has no other
//      privileges on this name.
//   2. The policy operator signs its OWN transaction to set that text record. Success here,
//      signed by a different key than the admin's, is the actual proof of delegation.
//   3. The policy operator then tries two things it was NOT authorized for — setting a
//      different text key, and granting roles itself (which requires admin rights it doesn't
//      have) — and both must revert. Without this, "scoped" would just be a claim.
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { ABI, ADDRESSES } from '../lib/ensAddresses.js'
import { namehash, dnsEncode } from '../lib/ensUtils.js'

const PARENT_LABEL = process.env.ENS_PARENT_LABEL
const SPENDING_LIMIT_KEY = process.env.ENS_SPENDING_LIMIT_KEY || 'agent.spending.limit'
const IDENTITY = 'researcher'

function normalizeKey(raw) {
  return raw.startsWith('0x') ? raw : `0x${raw}`
}

async function main() {
  if (!PARENT_LABEL) throw new Error('ENS_PARENT_LABEL not set')
  const adminKey = normalizeKey(process.env.ENS_ADMIN_PRIVATE_KEY)
  const operatorKey = process.env.ENS_POLICY_OPERATOR_PRIVATE_KEY
  if (!operatorKey) throw new Error('ENS_POLICY_OPERATOR_PRIVATE_KEY not set')

  const admin = privateKeyToAccount(adminKey)
  const operator = privateKeyToAccount(normalizeKey(operatorKey))
  console.log(`admin account:    ${admin.address}`)
  console.log(`operator account: ${operator.address} (a genuinely different key)`)

  const transport = http(process.env.ENS_RPC_URL)
  const publicClient = createPublicClient({ chain: sepolia, transport })
  const adminWallet = createWalletClient({ account: admin, chain: sepolia, transport })
  const operatorWallet = createWalletClient({ account: operator, chain: sepolia, transport })

  const subname = `${IDENTITY}.${PARENT_LABEL}.eth`
  const node = namehash(subname)
  const toName = dnsEncode(subname)

  console.log(`\nresolving ${subname}'s resolver via UniversalResolverV2.findResolver...`)
  const findResolverAbi = parseAbi(['function findResolver(bytes name) view returns (address, bytes32, uint256)'])
  const [resolverAddress] = await publicClient.readContract({
    address: ADDRESSES.universalResolverV2,
    abi: findResolverAbi,
    functionName: 'findResolver',
    args: [toName],
  })
  console.log(`  resolver: ${resolverAddress}`)

  console.log(`\n1) admin grants operator a role scoped to just "${SPENDING_LIMIT_KEY}"...`)
  const grantHash = await adminWallet.writeContract({
    address: resolverAddress,
    abi: ABI.permissionedResolver,
    functionName: 'authorizeTextRoles',
    args: [toName, SPENDING_LIMIT_KEY, operator.address, true],
    account: admin,
  })
  await publicClient.waitForTransactionReceipt({ hash: grantHash })
  console.log(`   tx: ${grantHash}`)

  console.log(`\n2) operator (own key, not admin) sets "${SPENDING_LIMIT_KEY}" itself...`)
  const before = await publicClient.readContract({
    address: resolverAddress,
    abi: ABI.permissionedResolver,
    functionName: 'text',
    args: [node, SPENDING_LIMIT_KEY],
  })
  const setHash = await operatorWallet.writeContract({
    address: resolverAddress,
    abi: ABI.permissionedResolver,
    functionName: 'setText',
    args: [node, SPENDING_LIMIT_KEY, before],
    account: operator,
  })
  const setReceipt = await publicClient.waitForTransactionReceipt({ hash: setHash })
  console.log(`   tx: ${setHash} (from: ${setReceipt.from}) — status: ${setReceipt.status}`)

  console.log(`\n3) operator tries to set a DIFFERENT key ("avatar") it was NOT authorized for (expect revert)...`)
  try {
    await operatorWallet.writeContract({
      address: resolverAddress,
      abi: ABI.permissionedResolver,
      functionName: 'setText',
      args: [node, 'avatar', 'nope'],
      account: operator,
    })
    console.error('   ✗ UNEXPECTED: this should have reverted')
    process.exit(1)
  } catch (err) {
    console.log(`   ✓ reverted as expected: ${err.shortMessage || err.message}`)
  }

  console.log('\n4) operator tries to grant roles itself (needs admin rights it does not have, expect revert)...')
  try {
    await operatorWallet.writeContract({
      address: resolverAddress,
      abi: ABI.permissionedResolver,
      functionName: 'authorizeTextRoles',
      args: [toName, SPENDING_LIMIT_KEY, operator.address, true],
      account: operator,
    })
    console.error('   ✗ UNEXPECTED: this should have reverted')
    process.exit(1)
  } catch (err) {
    console.log(`   ✓ reverted as expected: ${err.shortMessage || err.message}`)
  }

  console.log('\n=== DONE — delegation to a genuinely separate account is real and correctly scoped ===')
}

main().catch((err) => {
  console.error('proof failed:', err)
  process.exit(1)
})
