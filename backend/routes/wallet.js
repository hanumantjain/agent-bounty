const express = require('express')

const router = express.Router()

const MIRROR_NODE_URL = process.env.HEDERA_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com'
const TINYBARS_PER_HBAR = 100_000_000
const DATA_CREDIT_TOKEN_ID = process.env.DATA_CREDIT_TOKEN_ID || null

async function fetchAdcBalance(accountId) {
  if (!DATA_CREDIT_TOKEN_ID) return null
  const res = await fetch(`${MIRROR_NODE_URL}/api/v1/accounts/${accountId}/tokens?token.id=${DATA_CREDIT_TOKEN_ID}`)
  if (!res.ok) return null
  const body = await res.json()
  const entry = (body.tokens || []).find((t) => t.token_id === DATA_CREDIT_TOKEN_ID)
  return entry ? entry.balance / 100 : 0
}

// agentbounty.eth's Hedera account is the plain shared one (see agent/lib/verifier.js) — it isn't
// resolved through resolveIdentityCreds since it was deliberately decided NOT to be a separate
// per-identity account. Each worker identity (researcher/intern/director) resolves to its own
// dedicated account when configured, falling back to the same shared account otherwise.
async function resolveAccountId(identity) {
  if (identity === 'manager' || identity === 'agentbounty') {
    return process.env.AGENT_HEDERA_ACCOUNT_ID
  }
  const { resolveIdentityCreds } = await import('../../agent/lib/bountyEscrow.js')
  return resolveIdentityCreds(identity).accountId
}

router.get('/:identity', async (req, res) => {
  try {
    const accountId = await resolveAccountId(req.params.identity)
    if (!accountId) {
      return res.status(404).json({ error: `no Hedera account configured for ${req.params.identity}` })
    }

    const [accountRes, txRes, adcBalance] = await Promise.all([
      fetch(`${MIRROR_NODE_URL}/api/v1/accounts/${accountId}`),
      fetch(`${MIRROR_NODE_URL}/api/v1/transactions?account.id=${accountId}&limit=5&order=desc`),
      fetchAdcBalance(accountId),
    ])
    if (!accountRes.ok) throw new Error(`mirror node account lookup failed: ${accountRes.status}`)
    if (!txRes.ok) throw new Error(`mirror node transaction lookup failed: ${txRes.status}`)

    const account = await accountRes.json()
    const txBody = await txRes.json()

    const balanceHbar = account.balance ? account.balance.balance / TINYBARS_PER_HBAR : null

    const transactions = (txBody.transactions || []).map((tx) => {
      const transfer = (tx.transfers || []).find((t) => t.account === accountId)
      // A token-only settlement (e.g. paid in ADC) moves no HBAR for this account beyond the
      // fee — which the facilitator pays, not the agent — so netHbar alone would silently show
      // a real payment as "0.0000 HBAR", nothing happened. Surface the token side too.
      const tokenTransfer = DATA_CREDIT_TOKEN_ID
        ? (tx.token_transfers || []).find((t) => t.account === accountId && t.token_id === DATA_CREDIT_TOKEN_ID)
        : null
      return {
        id: tx.transaction_id,
        type: tx.name,
        result: tx.result,
        timestampMs: Number(tx.consensus_timestamp?.split('.')[0]) * 1000,
        netHbar: transfer ? transfer.amount / TINYBARS_PER_HBAR : 0,
        netAdc: tokenTransfer ? tokenTransfer.amount / 100 : 0,
      }
    })

    res.json({ identity: req.params.identity, accountId, balanceHbar, adcBalance, transactions })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

module.exports = router
