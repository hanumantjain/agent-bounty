import { useEffect, useState } from 'react'

interface BountyDetails {
  taskId: string
  creator: string
  rewardTinybars: string
  description: string
  status: string
  agent: string | null
  answer: { verdict: string; threshold: number; largestWithdrawal: unknown } | null
  contractAddress: string
}

const TINYBARS_PER_HBAR = 100_000_000
const hbar = (tinybars: string) => (Number(tinybars) / TINYBARS_PER_HBAR).toString()

export default function Bounty() {
  const [bounty, setBounty] = useState<BountyDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    fetch('/api/bounty/current')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no bounty found'))))
      .then(setBounty)
      .catch((e) => setError(e.message))
  }

  useEffect(load, [])

  return (
    <div className="page">
      <h1>Bounty Details</h1>
      {error && <p className="error">{error}</p>}
      {bounty && (
        <div className="card">
          <div className="card-row">
            <span className={`badge badge-${bounty.status.toLowerCase()}`}>{bounty.status}</span>
            <button className="button-ghost" onClick={load}>
              Refresh
            </button>
          </div>
          <p className="description">{bounty.description}</p>

          <div className="detail-row">
            <span className="stat-label">Task ID</span>
            <span className="mono small">{bounty.taskId}</span>
          </div>
          <div className="detail-row">
            <span className="stat-label">Creator</span>
            <span className="mono small">{bounty.creator}</span>
          </div>
          <div className="detail-row">
            <span className="stat-label">Reward</span>
            <span>{hbar(bounty.rewardTinybars)} HBAR</span>
          </div>
          <div className="detail-row">
            <span className="stat-label">Agent</span>
            <span className="mono small">{bounty.agent ?? '—'}</span>
          </div>

          {bounty.answer && (
            <>
              <h3>Submitted Answer</h3>
              <pre className="log-data">{JSON.stringify(bounty.answer, null, 2)}</pre>
            </>
          )}

          <p className="hint">
            Contract:{' '}
            <a href={`https://hashscan.io/testnet/contract/${bounty.contractAddress}`} target="_blank" rel="noreferrer">
              view on HashScan
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
