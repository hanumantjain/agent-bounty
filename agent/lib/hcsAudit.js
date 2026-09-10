import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction, AccountId, PrivateKey } from '@hashgraph/sdk'

// Signs as agentbounty.eth's own account — the same manager identity that creates bounties,
// deployed the escrow contract, and releases every reward. Logging the audit trail under that
// same identity keeps "who attests to this payment happened" consistent across the app.
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
  return client
}

/// One-time setup: creates the HCS topic that every x402 settlement gets logged to. Run via
/// scripts/setupHcsAuditTopic.js, not called at request time — the resulting topic ID goes into
/// .env as HCS_AUDIT_TOPIC_ID.
export async function createAuditTopic() {
  const client = makeOperatorClient()
  const tx = await new TopicCreateTransaction().setTopicMemo('AgentBounty x402 payment audit trail').execute(client)
  const receipt = await tx.getReceipt(client)
  return receipt.topicId.toString()
}

/// Logs one x402 settlement to the audit topic. Returns enough to independently look the
/// message back up on the mirror node (topic + sequence number), not just a local claim that
/// logging happened.
export async function submitPaymentAudit(record) {
  const topicId = process.env.HCS_AUDIT_TOPIC_ID
  if (!topicId) throw new Error('HCS_AUDIT_TOPIC_ID not set')

  const client = makeOperatorClient()
  const message = JSON.stringify({ ...record, loggedAt: new Date().toISOString() })

  const tx = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client)
  const receipt = await tx.getReceipt(client)

  return {
    topicId,
    sequenceNumber: receipt.topicSequenceNumber.toString(),
    transactionId: tx.transactionId.toString(),
  }
}
