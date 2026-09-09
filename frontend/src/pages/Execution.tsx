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
    <div className="page">
      <h1>Live Execution</h1>
      <div className="identity-select">
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
        <button className="button" disabled={running} onClick={run}>
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

      <div className="log">
        {log.length === 0 && <p className="hint">Click "Run Agent" to start.</p>}
        {log.map((entry, i) => (
          <div className="log-entry" key={i}>
            <span className="log-step">{entry.step}</span>
            {formatData(entry.data) && <pre className="log-data">{formatData(entry.data)}</pre>}
          </div>
        ))}
      </div>
    </div>
  )
}
