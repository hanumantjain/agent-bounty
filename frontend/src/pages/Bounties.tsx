import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAgentStatus } from '../lib/agentStatus'

interface Bounty {
  taskId: string
  creator: string
  rewardTinybars: string
  description: string
  status: string
  agent: string | null
  dataPriceTinybars: string
}

interface Identity {
  subname: string
  spendingLimitHbar: number
}

const TINYBARS_PER_HBAR = 100_000_000
const hbar = (tinybars: string) => (Number(tinybars) / TINYBARS_PER_HBAR).toString()

export default function Bounties() {
  const { isRunning, currentStep, activeIdentity } = useAgentStatus()
  const [bounty, setBounty] = useState<Bounty | null>(null)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bounty/current')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no bounty found'))))
      .then(setBounty)
      .catch((e) => setError(e.message))
  }, [isRunning])

  useEffect(() => {
    fetch(`/api/bounty/identity/${activeIdentity}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setIdentity)
      .catch(() => setIdentity(null))
  }, [activeIdentity])

  return (
    <div className="mx-auto max-w-3xl">
      {/* Status strip */}
      <div className="mb-6 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
        <span className={isRunning ? 'pulse-dot' : 'inline-flex h-2 w-2 rounded-full bg-dim'} />
        <span className={isRunning ? 'text-live' : 'text-dim'}>{isRunning ? 'Agent Active' : 'Agent Idle'}</span>
      </div>

      <div className="mb-8">
        <h1>{isRunning ? 'Your agent is working autonomously.' : 'Bounty Marketplace'}</h1>
        <p className="mt-1.5 text-sm text-dim">
          {isRunning
            ? (currentStep ?? 'Analyzing live blockchain data within its ENSv2 permission boundary.')
            : 'Find and assign bounties to your AI agents.'}
        </p>
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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-inset text-lg text-heading">
                ◆
              </div>
              <div>
                <div className="mb-1.5 text-base font-semibold text-heading">{bounty.description}</div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="tag">DeFi Security</span>
                  <span className="tag">Blockchain Data</span>
                </div>
              </div>
            </div>
            <span className={`badge badge-${bounty.status.toLowerCase()}`}>{bounty.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-6 border-t border-border pt-5 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <span className="label">Reward</span>
              <span className="text-xl font-bold text-heading">{hbar(bounty.rewardTinybars)} HBAR</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="label">Data cost</span>
              <span className="text-xl font-bold text-heading">{hbar(bounty.dataPriceTinybars)} HBAR</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="label">Spend limit</span>
              <span className="text-xl font-bold text-heading">
                {identity ? `${identity.spendingLimitHbar} HBAR` : '—'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="label">Status</span>
              <span className="text-xl font-bold text-heading">{bounty.status}</span>
            </div>
          </div>

          <Link to="/execution" className="btn-primary">
            Run Agent →
          </Link>
        </div>
      )}
    </div>
  )
}
