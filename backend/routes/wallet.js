const express = require('express')

const router = express.Router()

const MIRROR_NODE_URL = process.env.HEDERA_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com'
const TINYBARS_PER_HBAR = 100_000_000

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

    const [accountRes, txRes] = await Promise.all([
      fetch(`${MIRROR_NODE_URL}/api/v1/accounts/${accountId}`),
      fetch(`${MIRROR_NODE_URL}/api/v1/transactions?account.id=${accountId}&limit=5&order=desc`),
    ])
    if (!accountRes.ok) throw new Error(`mirror node account lookup failed: ${accountRes.status}`)
    if (!txRes.ok) throw new Error(`mirror node transaction lookup failed: ${txRes.status}`)

    const account = await accountRes.json()
    const txBody = await txRes.json()

    const balanceHbar = account.balance ? account.balance.balance / TINYBARS_PER_HBAR : null

    const transactions = (txBody.transactions || []).map((tx) => {
      const transfer = (tx.transfers || []).find((t) => t.account === accountId)
      return {
        id: tx.transaction_id,
        type: tx.name,
        result: tx.result,
        timestampMs: Number(tx.consensus_timestamp?.split('.')[0]) * 1000,
        netHbar: transfer ? transfer.amount / TINYBARS_PER_HBAR : 0,
      }
    })

    res.json({ identity: req.params.identity, accountId, balanceHbar, transactions })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

module.exports = router
