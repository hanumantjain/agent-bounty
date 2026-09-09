const express = require('express')

const router = express.Router()

function decodeAnswer(answerHex) {
  if (!answerHex || answerHex === '0x') return null
  try {
    return JSON.parse(Buffer.from(answerHex.slice(2), 'hex').toString('utf8'))
  } catch {
    return null
  }
}

const STATUS_NAMES = ['None', 'Open', 'Claimed', 'Submitted', 'Paid', 'Rejected']

function serializeBounty(taskId, bounty) {
  return {
    taskId,
    creator: bounty.creator,
    rewardTinybars: bounty.reward.toString(),
    description: bounty.description,
    status: STATUS_NAMES[bounty.status],
    agent: bounty.agent === '0x0000000000000000000000000000000000000000' ? null : bounty.agent,
    answer: decodeAnswer(bounty.answer),
  }
}

router.get('/current', async (req, res) => {
  try {
    const { makeHederaEvmClients, discoverLatestBounty } = await import('../../agent/lib/bountyEscrow.js')
    const { publicClient } = makeHederaEvmClients()
    const found = await discoverLatestBounty(publicClient, process.env.BOUNTY_CONTRACT_ADDRESS)
    if (!found) return res.status(404).json({ error: 'no bounty found' })
    res.json({
      ...serializeBounty(found.taskId, found.bounty),
      dataPriceTinybars: process.env.X402_PRICE_TINYBARS || '1000000',
      contractAddress: process.env.BOUNTY_CONTRACT_ADDRESS,
    })
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

router.post('/create', async (req, res) => {
  try {
    const description = String(req.body?.description ?? '').trim()
    const rewardHbar = Number(req.body?.rewardHbar)

    if (!description) return res.status(400).json({ error: 'description is required' })
    if (!(rewardHbar > 0)) return res.status(400).json({ error: 'rewardHbar must be a positive number' })

    const { makeHederaEvmClients, createBounty } = await import('../../agent/lib/bountyEscrow.js')
    const { account, publicClient, walletClient } = makeHederaEvmClients()

    const result = await createBounty({
      walletClient,
      publicClient,
      contractAddress: process.env.BOUNTY_CONTRACT_ADDRESS,
      account,
      description,
      rewardHbar,
    })

    res.json(result)
  } catch (err) {
    res.status(502).json({ error: err.message })
  }
})

router.get('/:taskId/check', async (req, res) => {
  try {
    const { checkAnswer } = await import('../../agent/lib/verifier.js')
    const result = await checkAnswer(req.params.taskId)
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
