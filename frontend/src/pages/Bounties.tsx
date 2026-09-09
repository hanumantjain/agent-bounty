import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

interface Bounty {
  taskId: string
  creator: string
  rewardTinybars: string
  description: string
  status: string
  agent: string | null
  dataPriceTinybars: string
}

const TINYBARS_PER_HBAR = 100_000_000
const hbar = (tinybars: string) => (Number(tinybars) / TINYBARS_PER_HBAR).toString()

export default function Bounties() {
  const [bounty, setBounty] = useState<Bounty | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bounty/current')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no bounty found'))))
      .then(setBounty)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Bounty Marketplace</h1>
        <p className="page-subtitle">Find and assign bounties to your AI agents.</p>
      </div>

      {error && (
        <p className="error">
          {error} — create one by running <code>npm run create-bounty</code> in <code>agent/</code>
        </p>
      )}

      {bounty && (
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon">◆</div>
              <div>
                <div className="card-title">{bounty.description}</div>
                <div className="tag-row">
                  <span className="tag">DeFi Security</span>
                  <span className="tag">Blockchain Data</span>
                </div>
              </div>
            </div>
            <span className={`badge badge-${bounty.status.toLowerCase()}`}>{bounty.status}</span>
          </div>

          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">Reward</span>
              <span className="stat-value">{hbar(bounty.rewardTinybars)} HBAR</span>
            </div>
            <div className="stat">
              <span className="stat-label">Data cost</span>
              <span className="stat-value">{hbar(bounty.dataPriceTinybars)} HBAR</span>
            </div>
          </div>

          <Link to="/execution" className="button">
            Run Agent
          </Link>
        </div>
      )}
    </div>
  )
}
