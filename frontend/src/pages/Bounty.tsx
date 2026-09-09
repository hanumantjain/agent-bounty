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
      <div className="page-header">
        <h1>Bounty Details</h1>
        <p className="page-subtitle">Task, submission, verification and payout status.</p>
      </div>

      {error && <p className="error">{error}</p>}

      {bounty && (
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon">▤</div>
              <div className="card-title">{bounty.description}</div>
            </div>
            <span className={`badge badge-${bounty.status.toLowerCase()}`}>{bounty.status}</span>
          </div>

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
              <pre className="activity-data">{JSON.stringify(bounty.answer, null, 2)}</pre>
            </>
          )}

          {bounty.status === 'Paid' && <div className="banner banner-success">✓ Independent verification passed — reward paid out.</div>}
          {bounty.status === 'Rejected' && <div className="banner banner-blocked">✗ Independent verification failed — reward withheld.</div>}

          <div className="card-header">
            <p className="hint">
              Contract:{' '}
              <a href={`https://hashscan.io/testnet/contract/${bounty.contractAddress}`} target="_blank" rel="noreferrer">
                view on HashScan
              </a>
            </p>
            <button className="button-ghost" onClick={load}>
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
