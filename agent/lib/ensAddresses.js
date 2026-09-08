import { parseAbi } from 'viem'

// Verified against /tmp/contracts-v2 (ensdomains/contracts-v2) deployments/sepolia/*.json
// and confirmed live via eth_getCode on Sepolia.
export const ADDRESSES = {
  verifiableFactory: '0x118bc31a50d559f7015a8da26d54b3b030cdb70f',
  userRegistryImpl: '0x840fa461059862ea466a711e8c98c8de732061c0',
  permissionedResolverImpl: '0x7e4b2d59938930168024201752ee5503df402303',
  universalResolverV2: '0x85edf8b6b7d4211e2b07aa687506b746357b92cf',
  ethRegistrar: '0xa4449a0dd2b83007553d9b1d28b583a46a805a30',
  ethRegistry: '0x67b728a792e789a8978b30cf1b3b641f19354b43',
  mockUSDC: '0xd3322b29a7bdee707d1684676f149bf41aa3422f',
}

// RegistryRolesLib role bits (registry-level roles)
const R = {
  ROLE_REGISTRAR: 1n << 0n,
  ROLE_REGISTER_RESERVED: 1n << 4n,
  ROLE_SET_PARENT: 1n << 8n,
  ROLE_UNREGISTER: 1n << 12n,
  ROLE_RENEW: 1n << 16n,
  ROLE_SET_SUBREGISTRY: 1n << 20n,
  ROLE_SET_RESOLVER: 1n << 24n,
  ROLE_SET_URI: 1n << 36n,
}
const ADMIN_SHIFT = 128n
export const RegistryRoles = {
  ...R,
  ROLE_REGISTRAR_ADMIN: R.ROLE_REGISTRAR << ADMIN_SHIFT,
  ROLE_REGISTER_RESERVED_ADMIN: R.ROLE_REGISTER_RESERVED << ADMIN_SHIFT,
  ROLE_SET_PARENT_ADMIN: R.ROLE_SET_PARENT << ADMIN_SHIFT,
  ROLE_UNREGISTER_ADMIN: R.ROLE_UNREGISTER << ADMIN_SHIFT,
  ROLE_RENEW_ADMIN: R.ROLE_RENEW << ADMIN_SHIFT,
  ROLE_SET_SUBREGISTRY_ADMIN: R.ROLE_SET_SUBREGISTRY << ADMIN_SHIFT,
  ROLE_SET_RESOLVER_ADMIN: R.ROLE_SET_RESOLVER << ADMIN_SHIFT,
  ROLE_SET_URI_ADMIN: R.ROLE_SET_URI << ADMIN_SHIFT,
}

// Bitmap granting ourselves every non-upgrade registry role + admin, on our own registry.
export const REGISTRY_OWNER_ROLEBITMAP = Object.values(RegistryRoles).reduce((a, b) => a | b, 0n)

// PermissionedResolverLib role bits
const P = {
  ROLE_SET_ADDR: 1n << 0n,
  ROLE_SET_TEXT: 1n << 4n,
  ROLE_SET_CONTENTHASH: 1n << 8n,
  ROLE_SET_PUBKEY: 1n << 12n,
  ROLE_SET_ABI: 1n << 16n,
  ROLE_SET_INTERFACE: 1n << 20n,
  ROLE_SET_NAME: 1n << 24n,
}
export const ResolverRoles = {
  ...P,
  ROLE_SET_ADDR_ADMIN: P.ROLE_SET_ADDR << ADMIN_SHIFT,
  ROLE_SET_TEXT_ADMIN: P.ROLE_SET_TEXT << ADMIN_SHIFT,
  ROLE_SET_CONTENTHASH_ADMIN: P.ROLE_SET_CONTENTHASH << ADMIN_SHIFT,
  ROLE_SET_PUBKEY_ADMIN: P.ROLE_SET_PUBKEY << ADMIN_SHIFT,
  ROLE_SET_ABI_ADMIN: P.ROLE_SET_ABI << ADMIN_SHIFT,
  ROLE_SET_INTERFACE_ADMIN: P.ROLE_SET_INTERFACE << ADMIN_SHIFT,
  ROLE_SET_NAME_ADMIN: P.ROLE_SET_NAME << ADMIN_SHIFT,
}

export const ABI = {
  verifiableFactory: parseAbi([
    'function deployProxy(address implementation, uint256 salt, bytes data) returns (address)',
    'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
  ]),
  userRegistry: parseAbi([
    'function initialize(address rootAccount, uint256 roleBitmap)',
    'function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)',
    'function setResolver(uint256 anyId, address resolver)',
    'function getTokenId(uint256 anyId) view returns (uint256)',
  ]),
  permissionedResolver: parseAbi([
    'function initialize(address admin, uint256 roleBitmap, bytes[] setters)',
    'function setText(bytes32 node, string key, string value)',
    'function text(bytes32 node, string key) view returns (string)',
    'function authorizeTextRoles(bytes toName, string key, address account, bool grant) returns (bool)',
  ]),
  ethRegistrar: parseAbi([
    'function isAvailable(string label) view returns (bool)',
    'function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256, uint256)',
    'function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)',
    'function commit(bytes32 commitment)',
    'function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)',
    'function MIN_COMMITMENT_AGE() view returns (uint64)',
  ]),
  erc20: parseAbi([
    'function mint(address to, uint256 amount)',
    'function approve(address spender, uint256 value) returns (bool)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
  ]),
  universalResolverV2: parseAbi([
    'function resolve(bytes name, bytes data) view returns (bytes, address)',
  ]),
}
