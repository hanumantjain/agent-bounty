import { createPublicClient, createWalletClient, http, encodeFunctionData, parseUnits } from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { ADDRESSES, ABI, REGISTRY_OWNER_ROLEBITMAP } from './ensAddresses.js'
import { namehash, randomSalt, randomSecret } from './ensUtils.js'

export function makeClients() {
  const rpcUrl = process.env.ENS_RPC_URL
  const rawKey = process.env.ENS_ADMIN_PRIVATE_KEY
  const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
  const account = privateKeyToAccount(privateKey)
  const transport = http(rpcUrl)
  const publicClient = createPublicClient({ chain: sepolia, transport })
  const walletClient = createWalletClient({ account, chain: sepolia, transport })
  return { account, publicClient, walletClient }
}

async function sendAndWait(publicClient, walletClient, params) {
  const hash = await walletClient.writeContract(params)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  return { hash, receipt }
}

export async function mintPaymentToken({ publicClient, walletClient, account, amount }) {
  const decimals = await publicClient.readContract({
    address: ADDRESSES.mockUSDC,
    abi: ABI.erc20,
    functionName: 'decimals',
  })
  const { hash } = await sendAndWait(publicClient, walletClient, {
    address: ADDRESSES.mockUSDC,
    abi: ABI.erc20,
    functionName: 'mint',
    args: [account.address, parseUnits(amount, decimals)],
    account,
  })
  return { hash, decimals }
}

export async function deployUserRegistry({ publicClient, walletClient, account }) {
  const salt = randomSalt()
  const initData = encodeFunctionData({
    abi: ABI.userRegistry,
    functionName: 'initialize',
    args: [account.address, REGISTRY_OWNER_ROLEBITMAP],
  })
  const { hash } = await sendAndWait(publicClient, walletClient, {
    address: ADDRESSES.verifiableFactory,
    abi: ABI.verifiableFactory,
    functionName: 'deployProxy',
    args: [ADDRESSES.userRegistryImpl, salt, initData],
    account,
  })
  const receipt = await publicClient.getTransactionReceipt({ hash })
  const deployedLog = receipt.logs.find(
    (l) => l.address.toLowerCase() === ADDRESSES.verifiableFactory.toLowerCase(),
  )
  const registryAddress = `0x${deployedLog.topics[2].slice(-40)}`
  return { hash, registryAddress }
}

export async function registerParentName({ publicClient, walletClient, account, label, registryAddress, durationSeconds }) {
  const secret = randomSecret()
  const params = [label, account.address, secret, registryAddress, '0x0000000000000000000000000000000000000000', BigInt(durationSeconds), ADDRESSES.mockUSDC, `0x${'00'.repeat(32)}`]

  const commitment = await publicClient.readContract({
    address: ADDRESSES.ethRegistrar,
    abi: ABI.ethRegistrar,
    functionName: 'makeCommitment',
    args: [label, account.address, secret, registryAddress, '0x0000000000000000000000000000000000000000', BigInt(durationSeconds), `0x${'00'.repeat(32)}`],
  })

  await sendAndWait(publicClient, walletClient, {
    address: ADDRESSES.ethRegistrar,
    abi: ABI.ethRegistrar,
    functionName: 'commit',
    args: [commitment],
    account,
  })

  const minAge = await publicClient.readContract({
    address: ADDRESSES.ethRegistrar,
    abi: ABI.ethRegistrar,
    functionName: 'MIN_COMMITMENT_AGE',
  })

  await new Promise((r) => setTimeout(r, Number(minAge) * 1000 + 5000))

  const [price, premium] = await publicClient.readContract({
    address: ADDRESSES.ethRegistrar,
    abi: ABI.ethRegistrar,
    functionName: 'getRegisterPrice',
    args: [label, BigInt(durationSeconds), ADDRESSES.mockUSDC],
  })
  const totalPrice = price + premium

  await sendAndWait(publicClient, walletClient, {
    address: ADDRESSES.mockUSDC,
    abi: ABI.erc20,
    functionName: 'approve',
    args: [ADDRESSES.ethRegistrar, totalPrice],
    account,
  })

  const { hash } = await sendAndWait(publicClient, walletClient, {
    address: ADDRESSES.ethRegistrar,
    abi: ABI.ethRegistrar,
    functionName: 'register',
    args: params,
    account,
  })

  return { hash, totalPrice }
}

export async function registerSubname({ publicClient, walletClient, account, registryAddress, label, roleBitmap, expirySeconds }) {
  const { hash } = await sendAndWait(publicClient, walletClient, {
    address: registryAddress,
    abi: ABI.userRegistry,
    functionName: 'register',
    args: [label, account.address, '0x0000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000', roleBitmap, BigInt(expirySeconds)],
    account,
  })
  return { hash }
}

export async function deployResolverForSubname({ publicClient, walletClient, account, adminRoleBitmap }) {
  const salt = randomSalt()
  const initData = encodeFunctionData({
    abi: ABI.permissionedResolver,
    functionName: 'initialize',
    args: [account.address, adminRoleBitmap, []],
  })
  const { hash } = await sendAndWait(publicClient, walletClient, {
    address: ADDRESSES.verifiableFactory,
    abi: ABI.verifiableFactory,
    functionName: 'deployProxy',
    args: [ADDRESSES.permissionedResolverImpl, salt, initData],
    account,
  })
  const receipt = await publicClient.getTransactionReceipt({ hash })
  const deployedLog = receipt.logs.find(
    (l) => l.address.toLowerCase() === ADDRESSES.verifiableFactory.toLowerCase(),
  )
  const resolverAddress = `0x${deployedLog.topics[2].slice(-40)}`
  return { hash, resolverAddress }
}

export async function setSubnameResolver({ publicClient, walletClient, account, registryAddress, subnameTokenIdAnyId, resolverAddress }) {
  const { hash } = await sendAndWait(publicClient, walletClient, {
    address: registryAddress,
    abi: ABI.userRegistry,
    functionName: 'setResolver',
    args: [subnameTokenIdAnyId, resolverAddress],
    account,
  })
  return { hash }
}
