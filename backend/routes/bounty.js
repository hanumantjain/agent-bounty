const express = require('express')
const { PRICING, priceForFirst, TOKEN_PRICING, priceForFirstInToken } = require('../lib/graph')
const { getSuggestions } = require('../lib/aiSuggest')

const router = express.Router()

// Data is priced per-item now (see backend/routes/data.js), so there's no single flat price to
// show — this is a representative baseline at the default sample size, for display purposes.
// Two figures now, since the endpoint genuinely accepts either asset (see requirePayment.js).
const BASELINE_DATA_PRICE_TINYBARS = priceForFirst(PRICING.defaultFirst)
const BASELINE_DATA_PRICE_ADC_UNITS = TOKEN_PRICING.tokenId ? priceForFirstInToken(PRICING.defaultFirst) : null

function decodeAnswer(answerHex) {
  if (!answerHex || answerHex === '0x') return null
  try {
    return JSON.parse(Buffer.from(answerHex.slice(2), 'hex').toString('utf8'))
  } catch {
    return null
  }
}

const STATUS_NAMES = ['None', 'Open', 'Claimed', 'Submitted', 'Paid', 'Rejected']
const ASSET_NAMES = ['HBAR', 'ADC']

function serializeBounty(taskId, bounty, agentLabel, creatorLabel) {
  const asset = ASSET_NAMES[bounty.asset]
  return {
    taskId,
    creator: bounty.creator,
    creatorLabel: creatorLabel ?? null,
    rewardTinybars: asset === 'HBAR' ? bounty.reward.toString() : null,
    rewardAdcUnits: asset === 'ADC' ? Number(bounty.reward) : null,
    description: bounty.description,
    taskType: bounty.taskType,
    status: STATUS_NAMES[bounty.status],
    agent: bounty.agent === '0x0000000000000000000000000000000000000000' ? null : bounty.agent,
    agentLabel: agentLabel ?? null,
    answer: decodeAnswer(bounty.answer),
  }
}

router.get('/task-types', async (req, res) => {
  const { TASK_TYPES } = await import('../../agent/lib/tasks.js')
  res.json(TASK_TYPES)
})

router.get('/list', async (req, res) => {
  try {
    const { makeHederaEvmClients, discoverAllBounties, resolveAgentLabel } = await import('../../agent/lib/bountyEscrow.js')
    const { publicClient } = makeHederaEvmClients()
    const all = await discoverAllBounties(publicClient, process.env.BOUNTY_CONTRACT_ADDRESS)
    const bounties = all
      .map(({ taskId, bounty }) => ({
        ...serializeBounty(taskId, bounty, resolveAgentLabel(bounty.agent), resolveAgentLabel(bounty.creator)),
        dataPriceTinybars: BASELINE_DATA_PRICE_TINYBARS,
      dataPriceAdcUnits: BASELINE_DATA_PRICE_ADC_UNITS,
        contractAddress: process.env.BOUNTY_CONTRACT_ADDRESS,
      }))
      .reverse() // newest first for display
    res.json(bounties)
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

router.get('/current', async (req, res) => {
  try {
    const { makeHederaEvmClients, discoverLatestBounty, resolveAgentLabel } = await import('../../agent/lib/bountyEscrow.js')
    const { publicClient } = makeHederaEvmClients()
    const found = await discoverLatestBounty(publicClient, process.env.BOUNTY_CONTRACT_ADDRESS)
    if (!found) return res.status(404).json({ error: 'no bounty found' })
    res.json({
      ...serializeBounty(found.taskId, found.bounty, resolveAgentLabel(found.bounty.agent), resolveAgentLabel(found.bounty.creator)),
      dataPriceTinybars: BASELINE_DATA_PRICE_TINYBARS,
      dataPriceAdcUnits: BASELINE_DATA_PRICE_ADC_UNITS,
      contractAddress: process.env.BOUNTY_CONTRACT_ADDRESS,
    })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

// Registered before the /:taskId catch-all below — otherwise "suggestions" would be swallowed
// as a literal taskId value (same ordering caution as /list and /current above).
router.get('/suggestions', async (req, res) => {
  try {
    const taskType = typeof req.query.taskType === 'string' ? req.query.taskType : undefined
    const suggestions = await getSuggestions(taskType)
    res.json({ suggestions })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

router.post('/create', async (req, res) => {
  try {
    const description = String(req.body?.description ?? '').trim()
    const asset = req.body?.asset === 'ADC' ? 'ADC' : 'HBAR'
    const taskType = String(req.body?.taskType ?? '')

    if (!description) return res.status(400).json({ error: 'description is required' })

    const { makeHederaEvmClients, createBounty, createBountyWithToken } = await import('../../agent/lib/bountyEscrow.js')
    const { getTaskDefinition } = await import('../../agent/lib/tasks.js')
    if (!getTaskDefinition(taskType)) return res.status(400).json({ error: `unsupported taskType: ${taskType}` })

    const { account, publicClient, walletClient } = makeHederaEvmClients()
    const contractAddress = process.env.BOUNTY_CONTRACT_ADDRESS

    let result
    if (asset === 'ADC') {
      const rewardAdcUnits = Number(req.body?.rewardAdcUnits)
      if (!(rewardAdcUnits > 0)) return res.status(400).json({ error: 'rewardAdcUnits must be a positive number' })
      result = await createBountyWithToken({
        walletClient,
        publicClient,
        contractAddress,
        account,
        description,
        rewardAdcUnits,
        taskType,
      })
    } else {
      const rewardHbar = Number(req.body?.rewardHbar)
      if (!(rewardHbar > 0)) return res.status(400).json({ error: 'rewardHbar must be a positive number' })
      result = await createBounty({
        walletClient,
        publicClient,
        contractAddress,
        account,
        description,
        rewardHbar,
        taskType,
      })
    }

    res.json(result)
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

router.get('/:taskId', async (req, res) => {
  try {
    const { makeHederaEvmClients, getBountyWithOriginalReward, resolveAgentLabel } = await import('../../agent/lib/bountyEscrow.js')
    const { publicClient } = makeHederaEvmClients()
    const bounty = await getBountyWithOriginalReward(publicClient, process.env.BOUNTY_CONTRACT_ADDRESS, req.params.taskId)
    if (bounty.status === 0) return res.status(404).json({ error: 'bounty not found' })
    res.json({
      ...serializeBounty(req.params.taskId, bounty, resolveAgentLabel(bounty.agent), resolveAgentLabel(bounty.creator)),
      dataPriceTinybars: BASELINE_DATA_PRICE_TINYBARS,
      dataPriceAdcUnits: BASELINE_DATA_PRICE_ADC_UNITS,
      contractAddress: process.env.BOUNTY_CONTRACT_ADDRESS,
    })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

router.get('/:taskId/check', async (req, res) => {
  try {
    const { checkAnswer } = await import('../../agent/lib/verifier.js')
    const result = await checkAnswer(req.params.taskId)

    // Best-effort plain-English note for the human reviewer — the deterministic result above
    // is already the real verification; a Claude API hiccup should never hide it.
    try {
      const { explainAnswer } = await import('../../agent/lib/aiExplain.js')
      const { explanation } = await explainAnswer(req.params.taskId)
      result.explanation = explanation
    } catch (err) {
      console.error('AI explanation failed (non-fatal):', err.message)
    }

    res.json(result)
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

router.post('/:taskId/decide', async (req, res) => {
  try {
    const { releaseDecision } = await import('../../agent/lib/verifier.js')
    const approved = Boolean(req.body?.approved)
    const result = await releaseDecision(req.params.taskId, approved)
    res.json(result)
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

router.get('/identity/:name', async (req, res) => {
  try {
    const { createPublicClient, http } = await import('viem')
    const { sepolia } = await import('viem/chains')
    const { resolveSpendingLimit } = await import('../../agent/lib/ens.js')

    const subname = `${req.params.name}.${process.env.ENS_PARENT_LABEL}.eth`
    const key = process.env.ENS_SPENDING_LIMIT_KEY || 'agent.spending.limit'
    const ensClient = createPublicClient({ chain: sepolia, transport: http(process.env.ENS_RPC_URL) })
    const limitHbar = await resolveSpendingLimit(ensClient, subname, key)

    res.json({ subname, spendingLimitHbar: limitHbar })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

module.exports = router
