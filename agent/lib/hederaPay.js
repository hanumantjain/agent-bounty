import { Client, TransferTransaction, TransactionId, AccountId, PrivateKey, Hbar } from '@hashgraph/sdk'

export async function buildAndSignPayment(
  { amountTinybars, payToAccountId, feePayerAccountId, network },
  { accountId, privateKey, keyType },
) {
  const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet()

  const agentKey =
    keyType === 'ED25519' ? PrivateKey.fromStringED25519(privateKey) : PrivateKey.fromStringECDSA(privateKey)

  const tx = new TransferTransaction()
    .addHbarTransfer(AccountId.fromString(accountId), Hbar.fromTinybars(-amountTinybars))
    .addHbarTransfer(AccountId.fromString(payToAccountId), Hbar.fromTinybars(amountTinybars))
    .setTransactionId(TransactionId.generate(AccountId.fromString(feePayerAccountId)))
    .setNodeAccountIds([AccountId.fromString('0.0.3')])
    .freezeWith(client)

  const signedTx = await tx.sign(agentKey)
  return Buffer.from(signedTx.toBytes()).toString('base64')
}

// Same shape as buildAndSignPayment, but moves a real HTS token instead of native HBAR —
// the second real settlement asset the x402 endpoint accepts.
export async function buildAndSignTokenPayment(
  { tokenId, amountUnits, payToAccountId, feePayerAccountId, network },
  { accountId, privateKey, keyType },
) {
  const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet()

  const agentKey =
    keyType === 'ED25519' ? PrivateKey.fromStringED25519(privateKey) : PrivateKey.fromStringECDSA(privateKey)

  const tx = new TransferTransaction()
    .addTokenTransfer(tokenId, AccountId.fromString(accountId), -amountUnits)
    .addTokenTransfer(tokenId, AccountId.fromString(payToAccountId), amountUnits)
    .setTransactionId(TransactionId.generate(AccountId.fromString(feePayerAccountId)))
    .setNodeAccountIds([AccountId.fromString('0.0.3')])
    .freezeWith(client)

  const signedTx = await tx.sign(agentKey)
  return Buffer.from(signedTx.toBytes()).toString('base64')
}
