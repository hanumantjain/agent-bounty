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
      <h1>Bounty Marketplace</h1>
      {error && <p className="error">{error} — create one with `npm run create-bounty` in agent/</p>}
      {bounty && (
        <div className="card">
          <div className="card-row">
            <span className={`badge badge-${bounty.status.toLowerCase()}`}>{bounty.status}</span>
          </div>
          <p className="description">{bounty.description}</p>
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
