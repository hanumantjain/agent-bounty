import { useEffect, useState } from 'react'
import { useAgentStatus } from '../lib/agentStatus'
import { useDisplayAsset } from '../lib/displayAsset'
import Term from '../components/Term'

interface Identity {
  subname: string
  spendingLimitHbar: number
}

interface WalletTransaction {
  id: string
  type: string
  result: string
  timestampMs: number
  netHbar: number
  netAdc: number
}

interface Wallet {
  accountId: string
  balanceHbar: number | null
  adcBalance: number | null
  transactions: WalletTransaction[]
}

const IDENTITIES = ['researcher', 'intern', 'director']

const TX_TYPE_LABELS: Record<string, string> = {
  CRYPTOTRANSFER: 'Payment',
  ETHEREUMTRANSACTION: 'Contract call',
}

export default function Agent() {
  const { lastPayment } = useAgentStatus()
  const { displayAsset } = useDisplayAsset()
  const [selected, setSelected] = useState('researcher')
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wallet, setWallet] = useState<Wallet | null>(null)

  useEffect(() => {
    setIdentity(null)
    setError(null)
    fetch(`/api/bounty/identity/${selected}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed to resolve identity'))))
      .then(setIdentity)
      .catch((e) => setError(e.message))
  }, [selected])

  useEffect(() => {
    setWallet(null)
    fetch(`/api/wallet/${selected}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setWallet)
      .catch(() => setWallet(null))
  }, [selected])

  const spentForThisIdentity = lastPayment?.identity === selected ? lastPayment : null
  // The progress bar visualizes the HBAR-denominated ENS spending limit specifically — an ADC
  // payment doesn't draw against that limit at all, so it shouldn't move this bar.
  const spentHbar = spentForThisIdentity?.asset === 'HBAR' ? spentForThisIdentity.amount : null
  const usedFraction = identity && spentHbar !== null ? Math.min(1, spentHbar / identity.spendingLimitHbar) : 0

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl">Agent Identity</h1>
        <p className="mt-1.5 text-sm text-dim">Your agent's ENSv2 identity, permissions and spending limits.</p>
      </div>

      <div className="mb-2 flex items-center gap-2">
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
      <p className="mb-6 text-xs text-dim">
        Three separate identities, each with its own wallet and spending limit — so when several agents compete for
        the same bounty, it's a real race between independent signers, not one wallet racing itself.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}

      {identity && (
        <div className="card">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-inset text-lg text-heading shadow-inner shadow-black/40">
                ◈
              </div>
              <div>
                <div className="mb-1.5 font-mono text-base font-semibold text-heading">{identity.subname}</div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="tag">
                    <Term name="ENSv2">ENSv2</Term>
                  </span>
                  <span className="tag">
                    <Term name="Sepolia">Sepolia</Term>
                  </span>
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
              {[
                { key: 'data-access', label: <>Data access (<Term name="Hedera x402">Hedera x402</Term>)</>, allowed: true },
                { key: 'bounty-execution', label: 'Bounty execution', allowed: true },
                { key: 'payment-execution', label: 'Payment execution', allowed: true },
                { key: 'fund-transfer', label: 'Direct fund transfer', allowed: false },
              ].map((perm, i, arr) => (
                <div
                  key={perm.key}
                  className={`flex items-center justify-between text-[13px] ${i < arr.length - 1 ? 'border-b border-border-soft pb-2.5' : ''}`}
                >
                  <span className="text-muted">{perm.label}</span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                      perm.allowed
                        ? 'border-live/30 bg-live-bg text-live'
                        : 'border-danger/30 bg-danger-bg text-danger'
                    }`}
                  >
                    {perm.allowed ? '✓' : '✕'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-baseline justify-between border-b border-border pb-3.5">
            <span className="label">Wallet balance</span>
            <div className="flex items-baseline gap-4">
              {displayAsset === 'ADC' && wallet?.adcBalance !== null && wallet?.adcBalance !== undefined ? (
                <>
                  <span className="text-xl font-bold text-heading">{wallet.adcBalance.toFixed(2)} ADC</span>
                  {wallet?.balanceHbar !== null && wallet?.balanceHbar !== undefined && (
                    <span className="text-xl font-bold text-heading">{wallet.balanceHbar.toFixed(2)} HBAR</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-xl font-bold text-heading">
                    {wallet?.balanceHbar !== null && wallet?.balanceHbar !== undefined
                      ? `${wallet.balanceHbar.toFixed(2)} HBAR`
                      : '—'}
                  </span>
                  {wallet?.adcBalance !== null && wallet?.adcBalance !== undefined && (
                    <span className="text-xl font-bold text-heading">{wallet.adcBalance.toFixed(2)} ADC</span>
                  )}
                </>
              )}
            </div>
          </div>
          <p className="text-xs text-dim">
            Data payments settle in whichever asset this identity can actually afford — ADC when its balance covers
            the price, HBAR otherwise.
          </p>

          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="label">Maximum spend</span>
              <span className="text-xl font-bold text-heading">{identity.spendingLimitHbar} HBAR</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-inset shadow-inner shadow-black/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-live/70 to-live transition-all duration-500"
                style={{ width: `${Math.max(usedFraction * 100, usedFraction > 0 ? 2 : 0)}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-dim">
              {spentForThisIdentity
                ? `Last spent ${spentForThisIdentity.amount} ${spentForThisIdentity.asset}${
                    spentForThisIdentity.asset === 'ADC' ? " — doesn't count against this HBAR limit" : ''
                  }`
                : 'No payments made yet this session'}
            </div>
          </div>

          <p className="text-sm text-dim">
            Resolved live from an ENS text record on Sepolia (<code>agent.spending.limit</code>), writable only by a
            narrowly-scoped on-chain permission — not a hardcoded value.
          </p>
        </div>
      )}

      {wallet && (
        <div className="card mt-4">
          <div className="flex items-baseline justify-between">
            <span className="label">Recent transactions</span>
            <span className="font-mono text-xs text-dim">{wallet.accountId}</span>
          </div>

          {wallet.transactions.length === 0 && <p className="text-sm text-dim">No transactions yet.</p>}

          <div className="flex flex-col">
            {wallet.transactions.map((tx) => {
              // Prefer whichever asset actually moved for this transaction — a token-only
              // settlement (paid in ADC) shows 0.0000 HBAR for this account since the
              // facilitator, not the agent, pays the fee, which would otherwise look like
              // nothing happened.
              const primary = tx.netAdc !== 0 ? { amount: tx.netAdc, unit: 'ADC', decimals: 2 } : { amount: tx.netHbar, unit: 'HBAR', decimals: 4 }
              return (
                <a
                  key={tx.id}
                  href={`https://hashscan.io/testnet/transaction/${tx.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 border-b border-border-soft py-2.5 text-[13px] no-underline last:border-0 hover:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                        tx.result === 'SUCCESS'
                          ? 'border-live/30 bg-live-bg text-live'
                          : 'border-danger/30 bg-danger-bg text-danger'
                      }`}
                    >
                      {primary.amount > 0 ? '↓' : primary.amount < 0 ? '↑' : '•'}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-heading">{TX_TYPE_LABELS[tx.type] ?? tx.type}</span>
                      <span className="text-[11px] text-dim">{new Date(tx.timestampMs).toLocaleString()}</span>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-sm font-semibold ${primary.amount > 0 ? 'text-live' : primary.amount < 0 ? 'text-heading' : 'text-dim'}`}
                  >
                    {primary.amount > 0 ? '+' : ''}
                    {primary.amount.toFixed(primary.decimals)} {primary.unit}
                  </span>
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
