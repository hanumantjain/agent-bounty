import { keccak256, stringToBytes, stringToHex, concat, toHex } from 'viem'

export function namehash(name) {
  let node = `0x${'00'.repeat(32)}`
  if (name) {
    const labels = name.split('.')
    for (let i = labels.length - 1; i >= 0; i--) {
      const labelHash = keccak256(stringToHex(labels[i]))
      node = keccak256(concat([node, labelHash]))
    }
  }
  return node
}

export function dnsEncode(name) {
  const labels = name.split('.').filter(Boolean)
  const parts = []
  for (const label of labels) {
    const bytes = stringToBytes(label)
    parts.push(new Uint8Array([bytes.length]), bytes)
  }
  parts.push(new Uint8Array([0]))
  return toHex(concat(parts))
}

export function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return BigInt(toHex(bytes))
}

export function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return toHex(bytes)
}

export function labelId(label) {
  return BigInt(keccak256(stringToHex(label)))
}

// Matches PermissionedResolverLib.partHash(string) = keccak256(bytes(key))
export function partHash(key) {
  return keccak256(stringToHex(key))
}

// Matches PermissionedResolverLib.resource(node, part) = uint256(keccak256(abi.encode(node, part)))
// abi.encode of two bytes32 values is just their concatenation (both are static 32-byte words).
export function resolverResource(node, key) {
  const part = partHash(key)
  return BigInt(keccak256(concat([node, part])))
}
