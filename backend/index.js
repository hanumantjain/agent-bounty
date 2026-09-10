const express = require('express')
const cors = require('cors')
const dataRouter = require('./routes/data')
const bountyRouter = require('./routes/bounty')
const agentRouter = require('./routes/agent')
const walletRouter = require('./routes/wallet')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'agentbounty-backend' })
})

app.use('/api/data', dataRouter)
app.use('/api/bounty', bountyRouter)
app.use('/api/agent', agentRouter)
app.use('/api/wallet', walletRouter)

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`)
  })
}

module.exports = app
