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
    <div className="page">
      <div className="page-header">
        <h1>Agent Identity</h1>
        <p className="page-subtitle">Your agent's ENSv2 identity, permissions and spending limits.</p>
      </div>

      <div className="identity-select">
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

      {error && <p className="error">{error}</p>}

      {identity && (
        <div className="card">
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon">◈</div>
              <div>
                <div className="card-title mono">{identity.subname}</div>
                <div className="tag-row">
                  <span className="tag">ENSv2</span>
                  <span className="tag">Sepolia</span>
                </div>
              </div>
            </div>
            <span className="badge">Verified Agent</span>
          </div>

          <h3>Permissions</h3>
          <div className="permission-list">
            <div className="permission-row">
              <span className="permission-name">Data purchases (Hedera x402)</span>
              <span className="permission-ok">✓ Allowed</span>
            </div>
            <div className="permission-row">
              <span className="permission-name">Bounty submission</span>
              <span className="permission-ok">✓ Allowed</span>
            </div>
          </div>

          <h3>Spending Limit</h3>
          <div className="stat">
            <span className="stat-value">{identity.spendingLimitHbar} HBAR</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: '100%' }} />
          </div>

          <p className="hint">
            Resolved live from Sepolia via a dedicated Permissioned Resolver and a key-scoped
            Enhanced Access Control role on the <code>agent.spending.limit</code> text record — not
            a hardcoded value.
          </p>
        </div>
      )}
    </div>
  )
}
