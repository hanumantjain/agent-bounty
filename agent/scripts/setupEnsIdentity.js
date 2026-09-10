import { ABI, ResolverRoles } from '../lib/ensAddresses.js'
import { namehash, labelId, dnsEncode } from '../lib/ensUtils.js'
import {
  makeClients,
  mintPaymentToken,
  deployUserRegistry,
  registerParentName,
  registerSubname,
  deployResolverForSubname,
  setSubnameResolver,
} from '../lib/ensSetup.js'

const PARENT_LABEL = process.env.ENS_PARENT_LABEL
const EXISTING_REGISTRY_ADDRESS = process.env.ENS_EXISTING_REGISTRY_ADDRESS
const ONLY_IDENTITY = process.env.ENS_ONLY_IDENTITY

const ALL_IDENTITIES = [
  { label: 'researcher', spendingLimit: '5' },
  { label: 'intern', spendingLimit: '1' },
  { label: 'director', spendingLimit: '10' },
]
const IDENTITIES = ONLY_IDENTITY ? ALL_IDENTITIES.filter((i) => i.label === ONLY_IDENTITY) : ALL_IDENTITIES

const YEAR = 365 * 24 * 60 * 60
const SPENDING_LIMIT_KEY = process.env.ENS_SPENDING_LIMIT_KEY || 'agent.spending.limit'
const ADMIN_ROLE_BITMAP = ResolverRoles.ROLE_SET_TEXT | ResolverRoles.ROLE_SET_TEXT_ADMIN

async function main() {
  if (!PARENT_LABEL) throw new Error('ENS_PARENT_LABEL not set')
  const { account, publicClient, walletClient } = makeClients()
  console.log(`admin account: ${account.address}`)

  let registryAddress = EXISTING_REGISTRY_ADDRESS

  if (!registryAddress) {
    console.log('\n1) minting MockUSDC...')
    const mint = await mintPaymentToken({ publicClient, walletClient, account, amount: '1000' })
    console.log(`   tx: ${mint.hash}`)

    console.log('\n2) deploying our own subname registry (UserRegistry via VerifiableFactory)...')
    const registry = await deployUserRegistry({ publicClient, walletClient, account })
    console.log(`   tx: ${registry.hash}`)
    console.log(`   registry address: ${registry.registryAddress}`)
    registryAddress = registry.registryAddress

    console.log(`\n3) registering parent name "${PARENT_LABEL}.eth" (commit-reveal, ~70s)...`)
    const parentReg = await registerParentName({
      publicClient,
      walletClient,
      account,
      label: PARENT_LABEL,
      registryAddress,
      durationSeconds: YEAR,
    })
    console.log(`   tx: ${parentReg.hash}`)
  } else {
    console.log(`\nreusing existing registry: ${registryAddress} (skipping steps 1-3)`)
  }

  const parentName = `${PARENT_LABEL}.eth`
  const results = {}

  for (const { label, spendingLimit } of IDENTITIES) {
    console.log(`\n--- identity: ${label}.${parentName} ---`)

    console.log('  4) registering subname on our registry...')
    const sub = await registerSubname({
      publicClient,
      walletClient,
      account,
      registryAddress,
      label,
      roleBitmap: 0n,
      expirySeconds: Math.floor(Date.now() / 1000) + YEAR,
    })
    console.log(`     tx: ${sub.hash}`)

    console.log('  5) deploying dedicated Permissioned Resolver...')
    const resolver = await deployResolverForSubname({
      publicClient,
      walletClient,
      account,
      adminRoleBitmap: ADMIN_ROLE_BITMAP,
    })
    console.log(`     tx: ${resolver.hash}`)
    console.log(`     resolver address: ${resolver.resolverAddress}`)

    console.log('  6) pointing subname at its resolver...')
    const setRes = await setSubnameResolver({
      publicClient,
      walletClient,
      account,
      registryAddress,
      subnameTokenIdAnyId: labelId(label),
      resolverAddress: resolver.resolverAddress,
    })
    console.log(`     tx: ${setRes.hash}`)

    const subname = `${label}.${parentName}`
    const node = namehash(subname)
    const toName = dnsEncode(subname)

    console.log('  7) authorizing key-scoped ROLE_SET_TEXT for "agent.spending.limit"...')
    const authHash = await walletClient.writeContract({
      address: resolver.resolverAddress,
      abi: ABI.permissionedResolver,
      functionName: 'authorizeTextRoles',
      args: [toName, SPENDING_LIMIT_KEY, account.address, true],
      account,
    })
    await publicClient.waitForTransactionReceipt({ hash: authHash })
    console.log(`     tx: ${authHash}`)

    console.log(`  8) setting text record (value: ${spendingLimit})...`)
    const setTextHash = await walletClient.writeContract({
      address: resolver.resolverAddress,
      abi: ABI.permissionedResolver,
      functionName: 'setText',
      args: [node, SPENDING_LIMIT_KEY, spendingLimit],
      account,
    })
    await publicClient.waitForTransactionReceipt({ hash: setTextHash })
    console.log(`     tx: ${setTextHash}`)

    results[label] = { subname, resolverAddress: resolver.resolverAddress, spendingLimit }
  }

  console.log('\n=== DONE ===')
  console.log(JSON.stringify({ parentName, registryAddress, identities: results }, null, 2))
}

main().catch((err) => {
  console.error('setup failed:', err)
  process.exit(1)
})
