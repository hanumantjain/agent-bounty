import { encodeFunctionData, decodeFunctionResult } from 'viem'
import { ABI, ADDRESSES } from './ensAddresses.js'
import { namehash, dnsEncode } from './ensUtils.js'

export async function resolveSpendingLimit(publicClient, subname, key) {
  const node = namehash(subname)
  const callData = encodeFunctionData({ abi: ABI.permissionedResolver, functionName: 'text', args: [node, key] })
  const [result] = await publicClient.readContract({
    address: ADDRESSES.universalResolverV2,
    abi: ABI.universalResolverV2,
    functionName: 'resolve',
    args: [dnsEncode(subname), callData],
  })
  const value = decodeFunctionResult({ abi: ABI.permissionedResolver, functionName: 'text', data: result })
  if (!value) throw new Error(`no "${key}" text record set for ${subname}`)
  return Number(value)
}
