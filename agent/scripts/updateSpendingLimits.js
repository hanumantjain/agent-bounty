import { encodeFunctionData, decodeFunctionResult } from 'viem'
import { ABI, ADDRESSES } from '../lib/ensAddresses.js'
import { namehash, dnsEncode } from '../lib/ensUtils.js'
import { makeClients } from '../lib/ensSetup.js'
import { resolveSpendingLimit } from '../lib/ens.js'

const PARENT_LABEL = process.env.ENS_PARENT_LABEL
const SPENDING_LIMIT_KEY = process.env.ENS_SPENDING_LIMIT_KEY || 'agent.spending.limit'

const NEW_LIMITS = {
  intern: '1',
  researcher: '5',
  director: '10',
}

async function resolverFor(publicClient, subname) {
  const node = namehash(subname)
  const callData = encodeFunctionData({ abi: ABI.permissionedResolver, functionName: 'text', args: [node, SPENDING_LIMIT_KEY] })
  const [, resolverAddress] = await publicClient.readContract({
    address: ADDRESSES.universalResolverV2,
    abi: ABI.universalResolverV2,
    functionName: 'resolve',
    args: [dnsEncode(subname), callData],
  })
  return resolverAddress
}

async function main() {
  if (!PARENT_LABEL) throw new Error('ENS_PARENT_LABEL not set')
  const { account, publicClient, walletClient } = makeClients()
  console.log(`admin account: ${account.address}`)

  const parentName = `${PARENT_LABEL}.eth`

  for (const [label, newLimit] of Object.entries(NEW_LIMITS)) {
    const subname = `${label}.${parentName}`
    const node = namehash(subname)

    const resolverAddress = await resolverFor(publicClient, subname)
    console.log(`\n--- ${subname} ---`)
    console.log(`  resolver: ${resolverAddress}`)

    const before = await resolveSpendingLimit(publicClient, subname, SPENDING_LIMIT_KEY)
    console.log(`  current limit: ${before}`)

    const hash = await walletClient.writeContract({
      address: resolverAddress,
      abi: ABI.permissionedResolver,
      functionName: 'setText',
      args: [node, SPENDING_LIMIT_KEY, newLimit],
      account,
    })
    await publicClient.waitForTransactionReceipt({ hash })
    console.log(`  tx: ${hash}`)

    const after = await resolveSpendingLimit(publicClient, subname, SPENDING_LIMIT_KEY)
    console.log(`  new limit: ${after}`)
  }

  console.log('\n=== DONE ===')
}

main().catch((err) => {
  console.error('update failed:', err)
  process.exit(1)
})
