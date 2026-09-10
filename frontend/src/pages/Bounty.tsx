import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { describeStep } from '../lib/stepNarrative'

interface BountyDetails {
  taskId: string
  creator: string
  creatorLabel: string | null
  rewardTinybars: string
  description: string
  taskType: string
  status: string
  agent: string | null
  agentLabel: string | null
  answer: {
    verdict: string
    threshold: number
    largest: unknown
    settlementAsset: string | null
    hcsAudit: { topicId: string; sequenceNumber: string; transactionId: string } | null
  } | null
  contractAddress: string
}

interface TaskTypeDef {
  label: string
  entity: string
  description: string
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

// The workers that always compete in a race (matches backend/routes/agent.js's
// RACE_IDENTITIES). Plain-language stages so someone with zero context can follow along —
// the raw technical step names are still available in the collapsible log below.
const RACE_PARTICIPANTS = ['researcher', 'intern', 'director']

const STAGES = ['Reviewing the job', 'Grabbing the job', 'Doing the work', 'Handing in the answer']

interface AgentProgress {
  stageIndex: number
  done: boolean
  blocked: { atStage: number; reason: string } | null
}

function findEntry(entries: RaceLogEntry[], step: string) {
  return entries.find((e) => e.step === step)
}

function deriveAgentProgress(entries: RaceLogEntry[], erroredOut: boolean): AgentProgress {
  const steps = new Set(entries.map((e) => e.step))
  let stageIndex = 0
  if (steps.has('allowed')) stageIndex = 1
  if (steps.has('claimed')) stageIndex = 2
  if (steps.has('submitted')) stageIndex = 3

  let blocked: AgentProgress['blocked'] = null
  const unsupported = findEntry(entries, 'skip-unsupported-task')
  const priced = findEntry(entries, 'skip-blocked')
  const claimFailed = findEntry(entries, 'skip-claim-failed')
  if (unsupported) blocked = { atStage: 0, reason: describeStep(unsupported.step, unsupported.data) }
  else if (priced) blocked = { atStage: 0, reason: describeStep(priced.step, priced.data) }
  else if (claimFailed) blocked = { atStage: 1, reason: describeStep(claimFailed.step, claimFailed.data) }
  else if (erroredOut) blocked = { atStage: stageIndex, reason: 'Ran into a problem — see the log below' }

  return { stageIndex, done: steps.has('submitted'), blocked }
}

// A one-sentence, number-backed summary of why an agent won or lost this bounty — pulled
// straight from its own log entries, not a canned phrase.
function summarizeOutcome(entries: RaceLogEntry[], isWinner: boolean, blocked: AgentProgress['blocked']): string | null {
  if (isWinner) {
    const allowed = findEntry(entries, 'allowed')
    return allowed ? `Won — ${describeStep('allowed', allowed.data).replace(/^Affordable — /, '')}` : 'Won this race'
  }
  if (blocked) return `Lost — ${blocked.reason.replace(/^Skipped — /, '')}`
  return null
}

export default function Bounty() {
  const { taskId } = useParams<{ taskId?: string }>()
  const [bounty, setBounty] = useState<BountyDetails | null>(null)
  const [taskTypes, setTaskTypes] = useState<Record<string, TaskTypeDef>>({})
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
    fetch('/api/bounty/task-types')
      .then((r) => (r.ok ? r.json() : {}))
      .then(setTaskTypes)
      .catch(() => setTaskTypes({}))
  }, [])

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

          {taskTypes[bounty.taskType]?.description && (
            <p className="-mt-2 text-sm text-dim">{taskTypes[bounty.taskType].description}</p>
          )}

          <div className="flex items-baseline justify-between border-b border-border pb-2.5">
            <span className="label">Task type</span>
            <span className="text-xs text-heading">{taskTypes[bounty.taskType]?.label ?? bounty.taskType}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-border pb-2.5">
            <span className="label">Task ID</span>
            <span className="font-mono text-xs">{bounty.taskId}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-border pb-2.5">
            <span className="label">Creator</span>
            <span className="text-sm text-heading" title={bounty.creator}>
              {bounty.creatorLabel ?? bounty.creator}
            </span>
          </div>
          <div className="flex items-baseline justify-between border-b border-border pb-2.5">
            <span className="label">Reward</span>
            <span>{hbar(bounty.rewardTinybars)} HBAR</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="label">Agent (claimant)</span>
            <span className="text-sm text-heading" title={bounty.agent ?? undefined}>
              {bounty.agent ? (bounty.agentLabel ?? bounty.agent) : '—'}
            </span>
          </div>

          {bounty.answer && (
            <>
              <h3>Submitted Answer</h3>
              {bounty.answer.settlementAsset && (
                <p className="mb-1.5 text-xs text-dim">
                  Data settled in <span className="font-semibold text-heading">{bounty.answer.settlementAsset}</span>
                </p>
              )}
              <pre className="overflow-x-auto rounded-md bg-inset px-2.5 py-2 font-mono text-[11.5px] whitespace-pre-wrap break-all text-muted">
                {JSON.stringify(bounty.answer, null, 2)}
              </pre>
              {bounty.answer.hcsAudit && (
                <p className="mt-1.5 text-xs text-dim">
                  Data payment logged to HCS topic {bounty.answer.hcsAudit.topicId} (sequence{' '}
                  {bounty.answer.hcsAudit.sequenceNumber}) —{' '}
                  <a
                    href={`https://hashscan.io/testnet/topic/${bounty.answer.hcsAudit.topicId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    view the audit trail on HashScan
                  </a>
                </p>
              )}
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
                {RACE_PARTICIPANTS.map((name, i) => (
                  <span key={name}>
                    {i > 0 && (i === RACE_PARTICIPANTS.length - 1 ? ' and ' : ', ')}
                    <strong className="text-heading">{name}</strong>
                  </span>
                ))}{' '}
                will all try to grab this job at the same time. Only one can win it. The winner
                does the work and gets paid automatically, with no human needing to click
                anything.
              </p>

              {raceLog.length === 0 && (
                <button className="btn-primary" onClick={activateBounty} disabled={racing}>
                  {racing ? 'Racing…' : '⚡ Activate Bounty'}
                </button>
              )}

              {raceLog.length > 0 && (() => {
                const participantProgress = RACE_PARTICIPANTS.map((participant) => {
                  const entries = raceLog.filter((e) => e.identity === participant)
                  const erroredOut = raceResult?.outcomes.some(
                    (o) => o.identity === participant && o.outcome === 'error',
                  )
                  return { participant, entries, progress: deriveAgentProgress(entries, Boolean(erroredOut)) }
                })
                const bareReason = (reason: string) => reason.replace(/^Skipped — /, '')
                const blocked = participantProgress.filter((p) => p.progress.blocked)
                const uniqueReasons = [...new Set(blocked.map((p) => bareReason(p.progress.blocked!.reason)))]
                const bothBlocked = Boolean(raceResult) && !raceResult?.winner && blocked.length > 0
                const blockedSummary = !bothBlocked
                  ? null
                  : uniqueReasons.length === 1
                    ? `Neither agent could take this job — ${uniqueReasons[0].toLowerCase()}.`
                    : blocked.map((p) => `${p.participant} — ${bareReason(p.progress.blocked!.reason).toLowerCase()}`).join('. ') + '.'

                const managerEntries = raceLog.filter((e) => e.identity.startsWith('agentbounty'))
                const managerSteps = new Set(managerEntries.map((e) => e.step))
                const released = managerEntries.find((e) => e.step === 'released')

                return (
                <div className="mt-1 flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {participantProgress.map(({ participant, entries, progress }) => {
                      const isWinner = raceResult?.winner === participant
                      const isActive = entries.length > 0
                      const outcomeSummary = summarizeOutcome(entries, isWinner, progress.blocked)

                      return (
                        <div
                          key={participant}
                          className={`rounded-xl border p-4 transition-colors ${
                            isWinner
                              ? 'border-live/40 bg-live-bg/40'
                              : progress.blocked
                                ? 'border-border-soft bg-inset/60'
                                : 'border-border bg-inset'
                          }`}
                        >
                          <div className="mb-3.5 flex items-center justify-between">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[12px] ${identityBadgeClass(participant)}`}
                            >
                              {participant}
                            </span>
                            {isWinner && <span className="badge badge-live">🏆 Winner</span>}
                            {progress.blocked && <span className="text-[11px] text-dim">Didn't win</span>}
                            {!isWinner && !progress.blocked && isActive && racing && (
                              <span className="pulse-dot" />
                            )}
                          </div>

                          <div className="flex flex-col gap-2.5">
                            {STAGES.map((stageLabel, i) => {
                              const isBlockedHere = progress.blocked?.atStage === i
                              const isPastBlocked = progress.blocked && i > progress.blocked.atStage
                              const isDone = i < progress.stageIndex || (i === progress.stageIndex && progress.done)
                              const isCurrent = i === progress.stageIndex && !progress.done && !progress.blocked

                              return (
                                <div key={stageLabel} className="flex items-center gap-2.5 text-[13px]">
                                  <span
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                                      isBlockedHere
                                        ? 'border-danger/30 bg-danger-bg text-danger'
                                        : isPastBlocked
                                          ? 'border-border bg-inset text-dim'
                                          : isDone
                                            ? 'border-live/30 bg-live-bg text-live'
                                            : isCurrent
                                              ? 'border-heading/40 bg-surface text-heading'
                                              : 'border-border bg-inset text-dim'
                                    }`}
                                  >
                                    {isBlockedHere ? '✕' : isPastBlocked ? '—' : isDone ? '✓' : i + 1}
                                  </span>
                                  <span className={isPastBlocked ? 'text-dim line-through' : isDone || isCurrent ? 'text-heading' : 'text-dim'}>
                                    {stageLabel}
                                  </span>
                                </div>
                              )
                            })}
                          </div>

                          {outcomeSummary && (
                            <p
                              className={`mt-3 border-t border-border-soft pt-2.5 text-xs ${
                                isWinner ? 'text-live' : 'text-dim'
                              }`}
                            >
                              {outcomeSummary}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {blockedSummary && (
                    <div className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger">
                      ✕ {blockedSummary}
                    </div>
                  )}

                  {managerEntries.length > 0 && (
                    <div
                      className={`rounded-xl border px-4 py-3 text-sm ${
                        released
                          ? released.data.verified
                            ? 'border-live/30 bg-live-bg text-live'
                            : 'border-danger/30 bg-danger-bg text-danger'
                          : 'border-border-soft bg-inset text-muted'
                      }`}
                    >
                      {released
                        ? released.data.verified
                          ? `✓ agentbounty.eth double-checked the work and paid ${raceResult?.winner} automatically`
                          : '✕ agentbounty.eth found the answer didn\'t hold up — no payment was made'
                        : managerSteps.has('comparison')
                          ? 'agentbounty.eth is deciding whether to pay out…'
                          : 'agentbounty.eth is double-checking the work…'}
                    </div>
                  )}

                  <details className="rounded-xl border border-border-soft">
                    <summary className="cursor-pointer px-4 py-2.5 text-xs text-dim select-none">
                      Show technical log
                    </summary>
                    <div className="max-h-[30vh] overflow-y-auto border-t border-border-soft px-4">
                      <div className="flex flex-col">
                        {raceLog.map((entry, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 border-b border-border-soft py-2 last:border-0"
                          >
                            <span
                              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-[11px] ${identityBadgeClass(entry.identity)}`}
                            >
                              {entry.identity}
                            </span>
                            <span className="text-[12.5px] text-muted">{describeStep(entry.step, entry.data)}</span>
                          </div>
                        ))}
                        {racing && (
                          <div className="flex items-center gap-2 py-2">
                            <span className="pulse-dot" />
                            <span className="font-mono text-[12px] text-dim">racing…</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
                )
              })()}
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
