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
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1>Bounty Details</h1>
        <p className="mt-1 text-sm text-dim">Task, submission, verification and payout status.</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {bounty && (
        <div className="card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-inset text-lg text-heading">
                ▤
              </div>
              <div className="text-base font-semibold text-heading">{bounty.description}</div>
            </div>
            <span className={`badge badge-${bounty.status.toLowerCase()}`}>{bounty.status}</span>
          </div>

          <div className="flex items-baseline justify-between border-b border-border pb-2.5">
            <span className="label">Task ID</span>
            <span className="font-mono text-xs">{bounty.taskId}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-border pb-2.5">
            <span className="label">Creator</span>
            <span className="font-mono text-xs">{bounty.creator}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-border pb-2.5">
            <span className="label">Reward</span>
            <span>{hbar(bounty.rewardTinybars)} HBAR</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="label">Agent</span>
            <span className="font-mono text-xs">{bounty.agent ?? '—'}</span>
          </div>

          {bounty.answer && (
            <>
              <h3>Submitted Answer</h3>
              <pre className="overflow-x-auto rounded-md bg-inset px-2.5 py-2 font-mono text-[11.5px] whitespace-pre-wrap break-all text-muted">
                {JSON.stringify(bounty.answer, null, 2)}
              </pre>
            </>
          )}

          {bounty.status === 'Paid' && (
            <div className="banner banner-success">✓ Independent verification passed — reward paid out.</div>
          )}
          {bounty.status === 'Rejected' && (
            <div className="banner banner-blocked">✗ Independent verification failed — reward withheld.</div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-dim">
              Contract:{' '}
              <a href={`https://hashscan.io/testnet/contract/${bounty.contractAddress}`} target="_blank" rel="noreferrer">
                view on HashScan
              </a>
            </p>
            <button className="btn-ghost" onClick={load}>
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
