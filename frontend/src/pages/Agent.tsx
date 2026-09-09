import { useEffect, useState } from 'react'
import { useAgentStatus } from '../lib/agentStatus'

interface Identity {
  subname: string
  spendingLimitHbar: number
}

const IDENTITIES = ['researcher', 'intern']

export default function Agent() {
  const { lastPayment } = useAgentStatus()
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

  const spentForThisIdentity = lastPayment?.identity === selected ? lastPayment : null
  const usedFraction =
    identity && spentForThisIdentity ? Math.min(1, spentForThisIdentity.amountHbar / identity.spendingLimitHbar) : 0

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1>Agent Identity</h1>
        <p className="mt-1.5 text-sm text-dim">Your agent's ENSv2 identity, permissions and spending limits.</p>
      </div>

      <div className="mb-6 flex items-center gap-2">
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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-inset text-lg text-heading">
                ◈
              </div>
              <div>
                <div className="mb-1.5 font-mono text-base font-semibold text-heading">{identity.subname}</div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="tag">ENSv2</span>
                  <span className="tag">Sepolia</span>
                </div>
              </div>
            </div>
            <span className="badge badge-live">
              <span className="h-1.5 w-1.5 rounded-full bg-live" /> Verified
            </span>
          </div>

          <div>
            <span className="label">Agent permissions</span>
            <div className="mt-2.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-border-soft pb-2.5 text-[13px]">
                <span className="text-muted">Data access (Hedera x402)</span>
                <span className="text-live">✓</span>
              </div>
              <div className="flex items-center justify-between border-b border-border-soft pb-2.5 text-[13px]">
                <span className="text-muted">Bounty execution</span>
                <span className="text-live">✓</span>
              </div>
              <div className="flex items-center justify-between border-b border-border-soft pb-2.5 text-[13px]">
                <span className="text-muted">Payment execution</span>
                <span className="text-live">✓</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted">Direct fund transfer</span>
                <span className="text-danger">✕</span>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="label">Maximum spend</span>
              <span className="text-xl font-bold text-heading">{identity.spendingLimitHbar} HBAR</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-inset">
              <div
                className="h-full rounded-full bg-heading transition-all duration-500"
                style={{ width: `${usedFraction * 100}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-dim">
              {spentForThisIdentity
                ? `Last spent ${spentForThisIdentity.amountHbar} HBAR`
                : 'No payments made yet this session'}
            </div>
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
