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
