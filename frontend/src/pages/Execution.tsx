import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAgentStatus } from '../lib/agentStatus'

interface LogEntry {
  step: string
  data: Record<string, unknown>
  at: number
}

const IDENTITIES = ['researcher', 'intern']
const TINYBARS_PER_HBAR = 100_000_000

function find(log: LogEntry[], step: string) {
  return log.find((e) => e.step === step)?.data
}

function relativeTime(at: number, now: number) {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s ago`
  return `${Math.round(seconds / 60)}m ago`
}

export default function Execution() {
  const { setActiveIdentity, setRunning, setCurrentStep, recordPayment } = useAgentStatus()
  const [identity, setIdentity] = useState('researcher')
  const [log, setLog] = useState<LogEntry[]>([])
  const [running, setRunningLocal] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [finalState, setFinalState] = useState<'idle' | 'blocked' | 'submitted' | 'unsupported-task'>('idle')
  const sourceRef = useRef<EventSource | null>(null)
  const logRef = useRef<LogEntry[]>([])

  useEffect(() => {
    logRef.current = log
  }, [log])

  useEffect(() => {
    setActiveIdentity(identity)
  }, [identity, setActiveIdentity])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])

  const run = () => {
    setLog([])
    setFinalState('idle')
    setRunningLocal(true)
    setRunning(true)
    setCurrentStep('Starting…')

    const source = new EventSource(`/api/agent/run?identity=${identity}`)
    sourceRef.current = source

    source.addEventListener('step', (e) => {
      const { step, data } = JSON.parse(e.data)
      setLog((prev) => [...prev, { step, data, at: Date.now() }])
      setCurrentStep(STEP_META[step]?.label ?? step)
    })

    source.addEventListener('agent-result', (e) => {
      const result = JSON.parse(e.data)
      if (result.outcome === 'blocked') setFinalState('blocked')
      if (result.outcome === 'submitted') setFinalState('submitted')
      if (result.outcome === 'unsupported-task') setFinalState('unsupported-task')
    })

    source.addEventListener('error', (e: MessageEvent) => {
      try {
        const { message } = JSON.parse(e.data)
        setLog((prev) => [...prev, { step: 'error', data: { message }, at: Date.now() }])
      } catch {
        // connection-level error, ignore
      }
    })

    source.addEventListener('done', () => {
      source.close()
      setRunningLocal(false)
      setRunning(false)
      setCurrentStep(null)

      const priceData = find(logRef.current, 'price') as { priceTinybars?: string } | undefined
      const paidData = find(logRef.current, 'paid') as { settlement?: { transaction?: string } } | undefined
      if (priceData?.priceTinybars && paidData?.settlement) {
        recordPayment({
          amountHbar: Number(priceData.priceTinybars) / TINYBARS_PER_HBAR,
          identity,
          at: Date.now(),
        })
      }
    })
  }

  const priceData = find(log, 'price') as { priceTinybars?: string } | undefined
  const limitData = find(log, 'spending-limit') as { limitHbar?: number } | undefined
  const allowedData = (find(log, 'allowed') ?? find(log, 'blocked')) as
    | { allowed?: boolean; priceHbar?: number; limitHbar?: number }
    | undefined
  const claimedData = find(log, 'claimed') as { claimTxHash?: string } | undefined
  const paidData = find(log, 'paid') as
    | { settlement?: { transaction?: string }; data?: { items?: unknown[] } }
    | undefined
  const analysisData = find(log, 'analysis') as { verdict?: string } | undefined
  const submittedData = find(log, 'submitted') as { submitTxHash?: string } | undefined
  const taskData = find(log, 'task-recognized') as { taskType?: string; label?: string } | undefined

  const priceHbar = priceData?.priceTinybars ? Number(priceData.priceTinybars) / TINYBARS_PER_HBAR : null

  const milestones = [
    {
      key: 'task',
      label: 'Task',
      reached: Boolean(taskData),
      detail: taskData ? `Recognized · ${taskData.label}` : null,
    },
    {
      key: 'ensv2',
      label: 'ENSv2',
      reached: Boolean(limitData),
      detail: limitData
        ? allowedData
          ? `${allowedData.allowed ? 'Permission granted' : 'Permission denied'} · limit ${limitData.limitHbar} HBAR`
          : `Spend limit: ${limitData.limitHbar} HBAR`
        : null,
      ok: allowedData ? Boolean(allowedData.allowed) : undefined,
    },
    {
      key: 'claim',
      label: 'Claim',
      reached: Boolean(claimedData),
      detail: claimedData ? 'Bounty claimed on-chain' : null,
    },
    {
      key: 'graph',
      label: 'The Graph',
      reached: Boolean(paidData?.data),
      detail: paidData?.data?.items ? `Data retrieved · ${paidData.data.items.length} transactions` : null,
    },
    {
      key: 'hedera',
      label: 'Hedera x402',
      reached: Boolean(paidData?.settlement),
      detail: priceHbar !== null ? `${priceHbar} HBAR paid` : null,
    },
    {
      key: 'agent',
      label: 'Agent',
      reached: Boolean(analysisData),
      detail: analysisData?.verdict ? `Analysis complete · ${analysisData.verdict}` : null,
    },
    {
      key: 'submit',
      label: 'Submission',
      reached: Boolean(submittedData),
      detail: submittedData ? 'Answer submitted on-chain — awaiting human review' : null,
    },
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1>Live Execution</h1>
        <p className="mt-1.5 text-sm text-dim">Watch the agent discover, decide, claim, pay and work — in real time.</p>
      </div>

      <div className="mb-6 flex items-center gap-2">
        {IDENTITIES.map((name) => (
          <button
            key={name}
            disabled={running}
            className={name === identity ? 'chip chip-active' : 'chip'}
            onClick={() => setIdentity(name)}
          >
            {name}
          </button>
        ))}
        <button className="btn-primary" disabled={running} onClick={run}>
          {running ? 'Running…' : 'Run Agent'}
        </button>
      </div>

      {finalState === 'blocked' && (
        <div className="banner banner-blocked">
          ⛔ BLOCKED — price exceeded this identity's spending limit. No claim or payment was attempted.
        </div>
      )}
      {finalState === 'unsupported-task' && (
        <div className="banner banner-blocked">
          ⛔ UNSUPPORTED — this agent doesn't recognize the bounty's task type. No claim or payment was attempted.
        </div>
      )}
      {finalState === 'submitted' && (
        <div className="banner banner-success">
          ✓ Answer submitted on-chain — head to{' '}
          <Link to="/bounty" className="underline">
            Bounty Details
          </Link>{' '}
          to review and approve.
        </div>
      )}

      {/* Milestone timeline */}
      {log.length > 0 && (
        <div className="card mb-6">
          <span className="label">Execution sequence</span>
          <div className="flex flex-col">
            {milestones.map((m, i) => (
              <div key={m.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                      m.ok === false
                        ? 'border-danger/30 bg-danger-bg text-danger'
                        : m.reached
                          ? 'border-live/30 bg-live-bg text-live'
                          : 'border-border bg-inset text-dim'
                    }`}
                  >
                    {m.ok === false ? '✕' : m.reached ? '✓' : i + 1}
                  </span>
                  {i < milestones.length - 1 && <span className="h-full w-px flex-1 bg-border" />}
                </div>
                <div className="min-w-0 flex-1 pb-5">
                  <div className={`text-sm font-semibold ${m.reached ? 'text-heading' : 'text-dim'}`}>{m.label}</div>
                  {m.detail && <div className="mt-0.5 text-xs text-dim">{m.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw activity log */}
      <div className="max-h-[40vh] overflow-y-auto rounded-2xl border border-border bg-surface px-5">
        <div className="flex flex-col">
          {log.length === 0 && <p className="py-4 text-sm text-dim">Click "Run Agent" to start.</p>}
          {log.map((entry, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-border-soft py-2.5 last:border-0">
              <span className="font-mono text-[12px] text-muted">{entry.step}</span>
              <span className="shrink-0 text-[11px] text-dim">{relativeTime(entry.at, now)}</span>
            </div>
          ))}
          {running && (
            <div className="flex items-center gap-2 py-2.5">
              <span className="pulse-dot" />
              <span className="font-mono text-[12px] text-dim">working…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const STEP_META: Record<string, { label: string }> = {
  identity: { label: 'Resolving agent identity' },
  discover: { label: 'Discovering open bounty' },
  'bounty-found': { label: 'Bounty found' },
  'task-recognized': { label: 'Task type recognized' },
  'unsupported-task': { label: 'Task type not supported — stopping' },
  'probe-price': { label: 'Checking data price (402)' },
  price: { label: 'Price received' },
  'resolve-ens': { label: 'Reading ENSv2 policy' },
  'spending-limit': { label: 'Spending limit resolved' },
  allowed: { label: 'ENSv2 permission granted — deciding to claim' },
  blocked: { label: 'ENSv2 permission denied' },
  claiming: { label: 'Claiming bounty on-chain' },
  claimed: { label: 'Bounty claimed' },
  paying: { label: 'Paying via Hedera x402' },
  paid: { label: 'Payment settled, data received' },
  analysis: { label: 'Analyzing blockchain data' },
  submitted: { label: 'Answer submitted on-chain' },
}
