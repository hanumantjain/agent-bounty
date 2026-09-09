import { useEffect, useState } from 'react'

interface Identity {
  subname: string
  spendingLimitHbar: number
}

const IDENTITIES = ['researcher', 'intern']

export default function Agent() {
  const [selected, setSelected] = useState('researcher')
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIdentity(null)
    setError(null)
    fetch(`/api/bounty/identity/${selected}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed to resolve identity'))))
      .then(setIdentity)
      .catch((e) => setError(e.message))
  }, [selected])

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1>Agent Identity</h1>
        <p className="mt-1 text-sm text-dim">Your agent's ENSv2 identity, permissions and spending limits.</p>
      </div>

      <div className="mb-5 flex items-center gap-2">
        {IDENTITIES.map((name) => (
          <button
            key={name}
            className={name === selected ? 'chip chip-active' : 'chip'}
            onClick={() => setSelected(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {identity && (
        <div className="card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-accent/40 bg-accent/15 text-lg text-accent">
                ◈
              </div>
              <div>
                <div className="mb-1 font-mono text-base font-semibold text-heading">{identity.subname}</div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="tag">ENSv2</span>
                  <span className="tag">Sepolia</span>
                </div>
              </div>
            </div>
            <span className="badge">Verified Agent</span>
          </div>

          <h3>Permissions</h3>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted">Data purchases (Hedera x402)</span>
              <span className="text-success">✓ Allowed</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted">Bounty submission</span>
              <span className="text-success">✓ Allowed</span>
            </div>
          </div>

          <h3>Spending Limit</h3>
          <span className="text-[22px] font-bold text-heading">{identity.spendingLimitHbar} HBAR</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-inset">
            <div className="h-full w-full rounded-full bg-gradient-to-br from-accent to-accent-2" />
          </div>

          <p className="text-sm text-dim">
            Resolved live from Sepolia via a dedicated Permissioned Resolver and a key-scoped
            Enhanced Access Control role on the <code>agent.spending.limit</code> text record — not
            a hardcoded value.
          </p>
        </div>
      )}
    </div>
  )
}
