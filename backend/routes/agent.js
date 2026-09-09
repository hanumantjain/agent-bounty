const express = require('express')

const router = express.Router()

router.get('/run', async (req, res) => {
  const identity = req.query.identity || 'researcher'

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders()

  const send = (event, data) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}\n\n`)
  }

  try {
    const { runAgent } = await import('../../agent/lib/runAgent.js')

    // Ends at "submitted" — verification and reward release now happen only when a human
    // reviews it on the Bounty Details screen (see routes/bounty.js's /check and /decide).
    const result = await runAgent({ identity, onStep: (step, data) => send('step', { step, data }) })
    send('agent-result', result)
    send('done', {})
  } catch (err) {
    send('error', { message: err.message })
  } finally {
    res.end()
  }
})

// Every configured identity attempts the same bounty at once. The contract's exclusive
// claimBounty (see contracts/BountyEscrow.sol) already guarantees only one of them can ever
// succeed — that's the "race." Whoever wins gets auto-verified and paid immediately with no
// human click, deliberately different from the manual review path in routes/bounty.js.
const RACE_IDENTITIES = ['researcher', 'intern']

// The parent name itself — agentbounty.eth — is the manager identity that checks submissions
// and decides who won. Derived the same way runAgent.js builds subnames, not hardcoded, so it
// stays correct if the registered parent label ever changes.
const MANAGER_NAME = `${process.env.ENS_PARENT_LABEL}.eth`

router.get('/race', async (req, res) => {
  const taskId = req.query.taskId
  if (!taskId) {
    res.status(400).json({ error: 'taskId is required' })
    return
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.flushHeaders()

  const send = (event, data) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}\n\n`)
  }

  try {
    const { runAgent } = await import('../../agent/lib/runAgent.js')

    const settled = await Promise.allSettled(
      RACE_IDENTITIES.map((identity) =>
        runAgent({
          identity,
          taskId,
          onStep: (step, data) => send('step', { identity, step, data }),
        }),
      ),
    )

    const outcomes = settled.map((r, i) => ({
      identity: RACE_IDENTITIES[i],
      ...(r.status === 'fulfilled' ? r.value : { outcome: 'error', error: r.reason.message }),
    }))

    const winner = outcomes.find((o) => o.outcome === 'submitted')
    if (winner) {
      const { verifyBounty } = await import('../../agent/lib/verifier.js')
      await verifyBounty({
        taskId,
        onStep: (step, data) => send('step', { identity: MANAGER_NAME, step, data }),
      })
    }

    send('race-result', { winner: winner?.identity ?? null, outcomes })
    send('done', {})
  } catch (err) {
    send('error', { message: err.message })
  } finally {
    res.end()
  }
})

module.exports = router
