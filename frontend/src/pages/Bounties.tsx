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
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1>Bounty Marketplace</h1>
        <p className="mt-1 text-sm text-dim">Find and assign bounties to your AI agents.</p>
      </div>

      {error && (
        <p className="text-sm text-danger">
          {error} — create one by running <code>npm run create-bounty</code> in <code>agent/</code>
        </p>
      )}

      {bounty && (
        <div className="card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-accent/40 bg-accent/15 text-lg text-accent">
                ◆
              </div>
              <div>
                <div className="mb-1 text-base font-semibold text-heading">{bounty.description}</div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="tag">DeFi Security</span>
                  <span className="tag">Blockchain Data</span>
                </div>
              </div>
            </div>
            <span className={`badge badge-${bounty.status.toLowerCase()}`}>{bounty.status}</span>
          </div>

          <div className="flex gap-10">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] tracking-wider text-dim uppercase">Reward</span>
              <span className="text-[22px] font-bold text-heading">{hbar(bounty.rewardTinybars)} HBAR</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] tracking-wider text-dim uppercase">Data cost</span>
              <span className="text-[22px] font-bold text-heading">{hbar(bounty.dataPriceTinybars)} HBAR</span>
            </div>
          </div>

          <Link to="/execution" className="btn-primary">
            Run Agent
          </Link>
        </div>
      )}
    </div>
  )
}
