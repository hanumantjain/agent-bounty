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
    const { verifyBounty } = await import('../../agent/lib/verifier.js')

    const result = await runAgent({ identity, onStep: (step, data) => send('step', { step, data }) })
    send('agent-result', result)

    if (result.outcome === 'submitted') {
      const verification = await verifyBounty({
        taskId: result.taskId,
        onStep: (step, data) => send('step', { step: `verify:${step}`, data }),
      })
      send('verification-result', verification)
    }

    send('done', {})
  } catch (err) {
    send('error', { message: err.message })
  } finally {
    res.end()
  }
})

module.exports = router
