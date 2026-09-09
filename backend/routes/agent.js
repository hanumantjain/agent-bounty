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

module.exports = router
