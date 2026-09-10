// One-time setup: creates the real HTS token the x402 data endpoint accepts as a second
// settlement asset, then distributes deliberately different starting balances to the three
// worker identities — same "genuinely different budgets" story as the HBAR spending limits,
// but for a second asset with a different trust model (checked live balance, not a declared
// ENS policy).
import {
  Client,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TransferTransaction,
  AccountId,
  PrivateKey,
} from '@hashgraph/sdk'
import { resolveIdentityCreds } from '../lib/bountyEscrow.js'

const ALLOCATIONS = {
  intern: 50_00, // 50.00 ADC — deliberately not enough to afford most runs, to prove the HBAR fallback
  researcher: 500_00,
  director: 2000_00,
}

function makeOperatorClient() {
  const network = process.env.HEDERA_NETWORK || 'testnet'
  const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet()
  const accountId = AccountId.fromString(process.env.AGENT_HEDERA_ACCOUNT_ID)
  const keyType = process.env.AGENT_HEDERA_KEY_TYPE || 'ED25519'
  const privateKey =
    keyType === 'ED25519'
      ? PrivateKey.fromStringED25519(process.env.AGENT_HEDERA_PRIVATE_KEY)
      : PrivateKey.fromStringECDSA(process.env.AGENT_HEDERA_PRIVATE_KEY)
  client.setOperator(accountId, privateKey)
  return { client, accountId, privateKey }
}

async function main() {
  const { client, accountId, privateKey } = makeOperatorClient()
  console.log(`treasury (manager) account: ${accountId.toString()}`)

  console.log('\n1) creating the AgentBounty Data Credit (ADC) token...')
  const createTx = await new TokenCreateTransaction()
    .setTokenName('AgentBounty Data Credit')
    .setTokenSymbol('ADC')
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(2)
    .setInitialSupply(100_000_00)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(accountId)
    .setAdminKey(privateKey.publicKey)
    .setSupplyKey(privateKey.publicKey)
    .execute(client)
  const createReceipt = await createTx.getReceipt(client)
  const tokenId = createReceipt.tokenId.toString()
  console.log(`   token: ${tokenId}`)

  for (const [identity, units] of Object.entries(ALLOCATIONS)) {
    console.log(`\n2) distributing ${(units / 100).toFixed(2)} ADC to ${identity}...`)
    const { accountId: destAccountId } = resolveIdentityCreds(identity)
    const tx = await new TransferTransaction()
      .addTokenTransfer(tokenId, accountId, -units)
      .addTokenTransfer(tokenId, AccountId.fromString(destAccountId), units)
      .execute(client)
    await tx.getReceipt(client)
    console.log(`   sent to ${destAccountId}, tx: ${tx.transactionId.toString()}`)
  }

  console.log('\n=== DONE ===')
  console.log(`Add to agent/.env: DATA_CREDIT_TOKEN_ID=${tokenId}`)
}

main().catch((err) => {
  console.error('setup failed:', err)
  process.exit(1)
})
