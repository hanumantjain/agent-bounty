import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAgentStatus } from '../lib/agentStatus'

interface Bounty {
  taskId: string
  creator: string
  rewardTinybars: string
  description: string
  taskType: string
  status: string
  agent: string | null
  agentLabel: string | null
  dataPriceTinybars: string
  dataPriceAdcUnits: number | null
}

interface Identity {
  subname: string
  spendingLimitHbar: number
}

interface TaskTypeDef {
  label: string
  entity: string
  description: string
}

interface Suggestion {
  taskType: string
  description: string
}

const TINYBARS_PER_HBAR = 100_000_000
const hbar = (tinybars: string) => (Number(tinybars) / TINYBARS_PER_HBAR).toString()
const adc = (units: number) => (units / 100).toFixed(2)

const TASK_ICONS: Record<string, string> = {
  'withdrawal-anomaly': '↓',
  'deposit-anomaly': '↑',
  'borrow-anomaly': '⇄',
  'repay-anomaly': '↩',
  'liquidation-anomaly': '⚡',
}

export default function Bounties() {
  const { isRunning, currentStep, activeIdentity } = useAgentStatus()
  const [bounties, setBounties] = useState<Bounty[]>([])
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [taskTypes, setTaskTypes] = useState<Record<string, TaskTypeDef>>({})
  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [rewardHbar, setRewardHbar] = useState('0.05')
  const [taskType, setTaskType] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bounty/task-types')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, TaskTypeDef>) => {
        setTaskTypes(data)
        const first = Object.keys(data)[0]
        if (first) setTaskType((current) => current || first)
      })
      .catch(() => setTaskTypes({}))
  }, [])

  const loadBounties = () => {
    fetch('/api/bounty/list')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed to load bounties'))))
      .then((data: Bounty[]) => {
        setBounties(data)
        setError(null)
      })
      .catch((e) => setError(e.message))
  }

  useEffect(loadBounties, [isRunning])

  useEffect(() => {
    fetch(`/api/bounty/identity/${activeIdentity}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setIdentity)
      .catch(() => setIdentity(null))
  }, [activeIdentity])

  const getSuggestions = async () => {
    setSuggestLoading(true)
    setSuggestError(null)
    try {
      const res = await fetch('/api/bounty/suggestions')
      if (!res.ok) throw new Error((await res.json()).error ?? 'failed to get suggestions')
      const { suggestions: result } = await res.json()
      setSuggestions(result)
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : String(e))
    } finally {
      setSuggestLoading(false)
    }
  }

  const applySuggestion = (s: Suggestion) => {
    setTaskType(s.taskType)
    setDescription(s.description)
  }

  const submitBounty = async () => {
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/bounty/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, rewardHbar, taskType }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'failed to create bounty')
      setDescription('')
      setRewardHbar('0.05')
      setShowForm(false)
      loadBounties()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const sortedBounties = [...bounties].sort((a, b) => {
    const aOpen = a.status === 'Open' ? 0 : 1
    const bOpen = b.status === 'Open' ? 0 : 1
    return aOpen - bOpen
  })

  return (
    <div className="mx-auto max-w-6xl">
      {/* Status strip */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
          <span className={isRunning ? 'pulse-dot' : 'inline-flex h-2 w-2 rounded-full bg-dim'} />
          <span className={isRunning ? 'text-live' : 'text-dim'}>{isRunning ? 'Agent Active' : 'Agent Idle'}</span>
        </div>
        {!showForm && (
          <button className="btn-ghost" onClick={() => setShowForm(true)}>
            + Post a Bounty
          </button>
        )}
      </div>

      <div className="mb-8">
        <h1 className="text-3xl">{isRunning ? 'Your agent is working autonomously.' : 'Bounty Marketplace'}</h1>
        <p className="mt-2 text-sm text-dim">
          {isRunning
            ? (currentStep ?? 'Analyzing live blockchain data within its ENSv2 permission boundary.')
            : 'Find and assign bounties to your AI agents.'}
        </p>
      </div>

      {showForm && (
        <div className="card mb-6">
          <span className="label">Post a bounty</span>

          <div className="flex flex-col gap-2">
            <button className="btn-ghost w-fit" onClick={getSuggestions} disabled={suggestLoading}>
              {suggestLoading ? 'Thinking…' : '💡 Get suggestions from live data'}
            </button>
            {suggestError && <p className="text-xs text-danger">{suggestError}</p>}
            {suggestions && suggestions.length === 0 && !suggestError && (
              <p className="text-xs text-dim">No notable activity to suggest from right now — try again shortly.</p>
            )}
            {suggestions && suggestions.length > 0 && (
              <div className="flex flex-col gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => applySuggestion(s)}
                    className="rounded-lg border border-border-soft bg-inset p-3 text-left text-sm text-muted transition-colors hover:border-border hover:bg-white/[0.03]"
                  >
                    <span className="tag mr-2">{taskTypes[s.taskType]?.label ?? s.taskType}</span>
                    {s.description}
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            className="w-full resize-none rounded-lg border border-border bg-inset p-3 text-sm text-heading placeholder:text-dim"
            rows={2}
            placeholder="Describe the task, e.g. Analyze recent protocol activity and determine whether a withdrawal pattern is suspicious"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="label">Task type</span>
              <select
                className="w-48 rounded-lg border border-border bg-inset p-2.5 text-sm text-heading"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
              >
                {Object.entries(taskTypes).map(([key, def]) => (
                  <option key={key} value={key}>
                    {def.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="label">Reward (HBAR)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-32 rounded-lg border border-border bg-inset p-2.5 text-sm text-heading"
                value={rewardHbar}
                onChange={(e) => setRewardHbar(e.target.value)}
              />
            </div>
            <button className="btn-primary" onClick={submitBounty} disabled={creating || !description.trim() || !taskType}>
              {creating ? 'Posting…' : 'Fund & Post'}
            </button>
            <button className="btn-ghost" onClick={() => setShowForm(false)} disabled={creating}>
              Cancel
            </button>
          </div>
          {taskTypes[taskType] && <p className="text-xs text-dim">{taskTypes[taskType].description}</p>}
          {createError && <p className="text-sm text-danger">{createError}</p>}
          <p className="text-xs text-dim">Funds the bounty with real testnet HBAR in the same transaction.</p>
        </div>
      )}

      {identity && (
        <p className="mb-4 text-xs text-dim">
          {activeIdentity} identity spend limit: <span className="text-heading">{identity.spendingLimitHbar} HBAR</span> —
          the agent skips any bounty priced above this when it runs.
        </p>
      )}

      {error && (
        <p className="text-sm text-danger">
          {error} — post one above, or run <code>npm run create-bounty</code> in <code>agent/</code>
        </p>
      )}

      {!error && bounties.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">◆</div>
          <p className="text-sm font-medium text-heading">No bounties yet</p>
          <p className="text-xs text-dim">
            Post one above, or run <code>npm run create-bounty</code> in <code>agent/</code>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sortedBounties.map((bounty) => (
          <Link
            key={bounty.taskId}
            to={`/bounty/${bounty.taskId}`}
            className="card card-hover block no-underline"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-inset text-lg text-heading shadow-inner shadow-black/40">
                  {TASK_ICONS[bounty.taskType] ?? '◆'}
                </div>
                <div>
                  <div className="mb-1.5 text-base font-semibold text-heading">{bounty.description}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="tag">{taskTypes[bounty.taskType]?.label ?? bounty.taskType}</span>
                  </div>
                </div>
              </div>
              <span className={`badge badge-${bounty.status.toLowerCase()}`}>{bounty.status}</span>
            </div>

            <div className="grid grid-cols-2 gap-6 border-t border-border pt-5">
              <div className="flex flex-col gap-1">
                <span className="label">Reward</span>
                <span className="text-xl font-bold text-heading">{hbar(bounty.rewardTinybars)} HBAR</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="label">Data cost</span>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xl font-bold text-heading">{hbar(bounty.dataPriceTinybars)} HBAR</span>
                  {bounty.dataPriceAdcUnits !== null && (
                    <>
                      <span className="text-sm text-dim">or</span>
                      <span className="text-xl font-bold text-heading">{adc(bounty.dataPriceAdcUnits)} ADC</span>
                    </>
                  )}
                </div>
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <span className="label">Agent</span>
                <span className="font-mono text-xs text-heading">
                  {bounty.agent
                    ? bounty.agentLabel
                      ? `${bounty.agentLabel} · ${bounty.agent.slice(0, 10)}…`
                      : `${bounty.agent.slice(0, 10)}…`
                    : '—'}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
