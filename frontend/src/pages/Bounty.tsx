import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

interface BountyDetails {
  taskId: string
  creator: string
  rewardTinybars: string
  description: string
  taskType: string
  status: string
  agent: string | null
  answer: { verdict: string; threshold: number; largest: unknown } | null
  contractAddress: string
}

interface CheckResult {
  matches: boolean
  submitted: { verdict: string; largest: unknown }
  freshAnalysis: { verdict: string; largest: unknown }
}

interface RaceLogEntry {
  identity: string
  step: string
  data: Record<string, unknown>
  at: number
}

interface RaceResult {
  winner: string | null
  outcomes: { identity: string; outcome: string }[]
}

const TINYBARS_PER_HBAR = 100_000_000
const hbar = (tinybars: string) => (Number(tinybars) / TINYBARS_PER_HBAR).toString()

function identityBadgeClass(identity: string) {
  if (identity.startsWith('agentbounty')) return 'border-live/30 bg-live-bg text-live'
  if (identity === 'intern') return 'border-warning/30 bg-warning-bg text-warning'
  if (identity === 'system') return 'border-danger/30 bg-danger-bg text-danger'
  return 'border-info/30 bg-info-bg text-info'
}

export default function Bounty() {
  const { taskId } = useParams<{ taskId?: string }>()
  const [bounty, setBounty] = useState<BountyDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [deciding, setDeciding] = useState(false)

  const [racing, setRacing] = useState(false)
  const [raceLog, setRaceLog] = useState<RaceLogEntry[]>([])
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null)
  const raceSourceRef = useRef<EventSource | null>(null)

  const load = () => {
    const url = taskId ? `/api/bounty/${taskId}` : '/api/bounty/current'
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no bounty found'))))
      .then((data) => {
        setBounty(data)
        setCheckResult(null)
        setCheckError(null)
      })
      .catch((e) => setError(e.message))
  }

  useEffect(load, [taskId])

  useEffect(() => {
    return () => raceSourceRef.current?.close()
  }, [])

  const runCheck = async () => {
    if (!bounty) return
    setChecking(true)
    setCheckError(null)
    try {
      const res = await fetch(`/api/bounty/${bounty.taskId}/check`)
      if (!res.ok) throw new Error((await res.json()).error ?? 'check failed')
      setCheckResult(await res.json())
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  const activateBounty = () => {
    if (!bounty) return
    setRaceLog([])
    setRaceResult(null)
    setRacing(true)

    const source = new EventSource(`/api/agent/race?taskId=${bounty.taskId}`)
    raceSourceRef.current = source

    source.addEventListener('step', (e) => {
      const { identity, step, data } = JSON.parse(e.data)
      setRaceLog((prev) => [...prev, { identity, step, data, at: Date.now() }])
    })

    source.addEventListener('race-result', (e) => {
      setRaceResult(JSON.parse(e.data))
    })

    source.addEventListener('done', () => {
      source.close()
      setRacing(false)
      load()
    })

    source.addEventListener('error', (e: MessageEvent) => {
      try {
        const { message } = JSON.parse(e.data)
        setRaceLog((prev) => [...prev, { identity: 'system', step: 'error', data: { message }, at: Date.now() }])
      } catch {
        // connection-level error, ignore
      }
    })
  }

  const decide = async (approved: boolean) => {
    if (!bounty) return
    setDeciding(true)
    try {
      const res = await fetch(`/api/bounty/${bounty.taskId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'decision failed')
      load()
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeciding(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl">Bounty Details</h1>
        <p className="mt-1 text-sm text-dim">Task, submission, human review and payout status.</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {bounty && (
        <div className="card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-inset text-lg text-heading shadow-inner shadow-black/40">
                ▤
              </div>
              <div className="text-base font-semibold text-heading">{bounty.description}</div>
            </div>
            <span className={`badge badge-${bounty.status.toLowerCase()}`}>{bounty.status}</span>
          </div>

          <div className="flex items-baseline justify-between border-b border-border pb-2.5">
            <span className="label">Task type</span>
            <span className="text-xs text-heading">{bounty.taskType}</span>
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
            <span className="label">Agent (claimant)</span>
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
            <div className="banner banner-success">✓ Approved by agentbounty.eth — reward paid out.</div>
          )}
          {bounty.status === 'Rejected' && (
            <div className="banner banner-blocked">✗ Rejected by agentbounty.eth — reward withheld.</div>
          )}

          {bounty.status === 'Open' && (
            <div>
              <span className="label">Activate</span>
              <p className="mt-1.5 mb-3 text-sm text-dim">
                Every configured agent identity races to claim this bounty at once — only one can
                win (the contract's claim is exclusive). The winner pays, does the work, and
                submits, then <strong className="text-heading">agentbounty.eth</strong> checks the
                submission and pays out immediately — no human click.
              </p>

              {raceLog.length === 0 && (
                <button className="btn-primary" onClick={activateBounty} disabled={racing}>
                  {racing ? 'Racing…' : '⚡ Activate Bounty'}
                </button>
              )}

              {raceLog.length > 0 && (
                <div className="mt-1 flex flex-col gap-3">
                  {raceResult && (
                    <div
                      className={`rounded-lg border px-4 py-3 text-sm ${
                        raceResult.winner ? 'border-live/30 bg-live-bg text-live' : 'border-danger/30 bg-danger-bg text-danger'
                      }`}
                    >
                      {raceResult.winner
                        ? `✓ ${raceResult.winner} won the race and was auto-paid`
                        : '✕ No identity was able to claim this bounty'}
                    </div>
                  )}

                  <div className="max-h-[30vh] overflow-y-auto rounded-2xl border border-border bg-surface px-5 shadow-lg shadow-black/20">
                    <div className="flex flex-col">
                      {raceLog.map((entry, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 border-b border-border-soft py-2.5 last:border-0"
                        >
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-[11px] ${identityBadgeClass(entry.identity)}`}
                          >
                            {entry.identity}
                          </span>
                          <span className="font-mono text-[12px] text-muted">{entry.step}</span>
                        </div>
                      ))}
                      {racing && (
                        <div className="flex items-center gap-2 py-2.5">
                          <span className="pulse-dot" />
                          <span className="font-mono text-[12px] text-dim">racing…</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {bounty.status === 'Submitted' && (
            <div>
              <span className="label">Human review</span>
              <p className="mt-1.5 mb-3 text-sm text-dim">
                Run an independent check against fresh Graph data before deciding. The agent's
                answer alone is never trusted. The release itself is still signed by{' '}
                <strong className="text-heading">agentbounty.eth</strong>, same as the automated
                race path — a human just decides when, instead of it happening immediately.
              </p>

              {!checkResult && (
                <button className="btn-ghost" onClick={runCheck} disabled={checking}>
                  {checking ? 'Checking…' : 'Check answer'}
                </button>
              )}

              {checkError && <p className="mt-2 text-sm text-danger">{checkError}</p>}

              {checkResult && (
                <div className="mt-1 flex flex-col gap-3">
                  <div
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      checkResult.matches ? 'border-live/30 bg-live-bg text-live' : 'border-danger/30 bg-danger-bg text-danger'
                    }`}
                  >
                    {checkResult.matches
                      ? '✓ Independent check matches the submitted answer'
                      : '✕ Independent check does NOT match the submitted answer'}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border-soft bg-inset p-3">
                      <div className="label mb-1">Submitted</div>
                      <div className="text-sm text-heading">{checkResult.submitted.verdict}</div>
                    </div>
                    <div className="rounded-lg border border-border-soft bg-inset p-3">
                      <div className="label mb-1">Fresh re-check</div>
                      <div className="text-sm text-heading">{checkResult.freshAnalysis.verdict}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button className="btn-primary" onClick={() => decide(true)} disabled={deciding}>
                      {deciding ? 'Submitting…' : 'Approve & Release'}
                    </button>
                    <button className="btn-ghost" onClick={() => decide(false)} disabled={deciding}>
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
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
