import { useRef, useState } from 'react'

interface LogEntry {
  step: string
  data: unknown
}

const IDENTITIES = ['researcher', 'intern']

function formatData(data: unknown) {
  if (data && typeof data === 'object' && Object.keys(data).length === 0) return ''
  return JSON.stringify(data, null, 2)
}

export default function Execution() {
  const [identity, setIdentity] = useState('researcher')
  const [log, setLog] = useState<LogEntry[]>([])
  const [running, setRunning] = useState(false)
  const [finalState, setFinalState] = useState<'idle' | 'blocked' | 'submitted' | 'verified' | 'rejected' | 'error'>(
    'idle',
  )
  const sourceRef = useRef<EventSource | null>(null)

  const run = () => {
    setLog([])
    setFinalState('idle')
    setRunning(true)

    const source = new EventSource(`/api/agent/run?identity=${identity}`)
    sourceRef.current = source

    source.addEventListener('step', (e) => {
      const { step, data } = JSON.parse(e.data)
      setLog((prev) => [...prev, { step, data }])
    })

    source.addEventListener('agent-result', (e) => {
      const result = JSON.parse(e.data)
      if (result.outcome === 'blocked') setFinalState('blocked')
    })

    source.addEventListener('verification-result', (e) => {
      const result = JSON.parse(e.data)
      setFinalState(result.verified ? 'verified' : 'rejected')
    })

    source.addEventListener('error', (e: MessageEvent) => {
      try {
        const { message } = JSON.parse(e.data)
        setLog((prev) => [...prev, { step: 'error', data: message }])
      } catch {
        // connection-level error, ignore
      }
    })

    source.addEventListener('done', () => {
      source.close()
      setRunning(false)
    })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1>Live Execution</h1>
        <p className="mt-1 text-sm text-dim">Watch the agent discover, pay, work and earn — in real time.</p>
      </div>

      <div className="mb-5 flex items-center gap-2">
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
          ⛔ BLOCKED — price exceeded this identity's spending limit. No payment was attempted.
        </div>
      )}
      {finalState === 'verified' && (
        <div className="banner banner-success">✓ Verified independently — reward released.</div>
      )}
      {finalState === 'rejected' && (
        <div className="banner banner-blocked">✗ Independent verification failed — reward withheld.</div>
      )}

      <div className="max-h-[55vh] overflow-y-auto rounded-2xl border border-border bg-surface px-5">
        <div className="flex flex-col">
          {log.length === 0 && <p className="py-4 text-sm text-dim">Click "Run Agent" to start.</p>}
          {log.map((entry, i) => (
            <div key={i} className="flex gap-3 border-b border-border py-2.5 last:border-0">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-[11px] text-success">
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-mono text-[13px] font-semibold text-heading">{entry.step}</span>
                {formatData(entry.data) && (
                  <pre className="mt-1.5 overflow-x-auto rounded-md bg-inset px-2.5 py-2 font-mono text-[11.5px] whitespace-pre-wrap break-all text-muted">
                    {formatData(entry.data)}
                  </pre>
                )}
              </div>
            </div>
          ))}
          {running && (
            <div className="flex gap-3 py-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] text-accent">
                ●
              </span>
              <span className="font-mono text-[13px] font-semibold text-dim">working…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
