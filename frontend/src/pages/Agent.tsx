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
      <h1>Agent Identity</h1>
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
          <div className="stat">
            <span className="stat-label">ENSv2 name</span>
            <span className="stat-value mono">{identity.subname}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Maximum spend</span>
            <span className="stat-value">{identity.spendingLimitHbar} HBAR</span>
          </div>
          <p className="hint">
            Resolved live from Sepolia via a dedicated Permissioned Resolver and a key-scoped
            Enhanced Access Control role on the <code>agent.spending.limit</code> text record.
          </p>
        </div>
      )}
    </div>
  )
}
