import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import Bounties from './pages/Bounties'
import Agent from './pages/Agent'
import Execution from './pages/Execution'
import Bounty from './pages/Bounty'
import Term from './components/Term'
import AssetToggle from './components/AssetToggle'
import { useDisplayAsset } from './lib/displayAsset'

const NAV_ITEMS = [
  { to: '/', label: 'Bounty Marketplace', icon: '◆', end: true },
  { to: '/agent', label: 'Agent Identity', icon: '◈', end: false },
  { to: '/execution', label: 'Live Execution', icon: '▶', end: false },
  { to: '/bounty', label: 'Bounty Details', icon: '▤', end: false },
]

function App() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [managerBalanceHbar, setManagerBalanceHbar] = useState<number | null>(null)
  const [managerBalanceAdc, setManagerBalanceAdc] = useState<number | null>(null)
  const { displayAsset } = useDisplayAsset()

  useEffect(() => {
    fetch('/api/wallet/manager')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setManagerBalanceHbar(data?.balanceHbar ?? null)
        setManagerBalanceAdc(data?.adcBalance ?? null)
      })
      .catch(() => {
        setManagerBalanceHbar(null)
        setManagerBalanceAdc(null)
      })
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <button
        className="fixed top-4 left-4 z-50 rounded-md border border-border bg-surface p-1.5 text-dim shadow-lg shadow-black/30 hover:bg-white/5 hover:text-heading lg:hidden"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle navigation"
      >
        ☰
      </button>

      <div className="flex min-h-0 flex-1">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-full w-64 shrink-0 -translate-x-full flex-col gap-8 overflow-y-auto border-r border-border bg-bg p-5 transition-transform duration-200 lg:static lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : ''}`}
        >
          <div className="flex items-center gap-2.5 px-1">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-signal text-base font-bold text-bg">
              A
            </span>
            <span className="text-[16px] font-semibold text-heading">AgentBounty</span>
          </div>

          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="w-4 text-center text-[13px]">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto flex shrink-0 flex-col gap-3 border-t border-border pt-4">
            <AssetToggle />
            <div className="flex items-center gap-2 px-1 text-[11px] text-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-dim" /> <Term name="ENSv2">ENSv2</Term>
              <span className="h-1.5 w-1.5 rounded-full bg-dim" /> <Term name="The Graph">The Graph</Term>
              <span className="h-1.5 w-1.5 rounded-full bg-dim" /> <Term name="Hedera">Hedera</Term>
            </div>
            <div className="rounded-lg border border-border-soft bg-inset p-3">
              <div className="label">Bounty Manager</div>
              <div className="mt-0.5 truncate font-mono text-[13px] font-medium text-heading">agentbounty.eth</div>
              <div className="mt-1.5 text-base font-bold text-heading">
                {displayAsset === 'ADC' && managerBalanceAdc !== null
                  ? `${managerBalanceAdc.toFixed(2)} ADC`
                  : managerBalanceHbar !== null
                    ? `${managerBalanceHbar.toFixed(2)} HBAR`
                    : '—'}
              </div>
              <div className="mt-1 text-[11px] text-dim">Checks submissions, releases rewards</div>
            </div>
          </div>
        </aside>

        <main className="h-full min-h-0 flex-1 overflow-y-auto px-4 pt-16 pb-8 sm:px-8 sm:pt-8 lg:px-12 lg:py-10">
          <Routes>
            <Route path="/" element={<Bounties />} />
            <Route path="/agent" element={<Agent />} />
            <Route path="/execution" element={<Execution />} />
            <Route path="/bounty" element={<Bounty />} />
            <Route path="/bounty/:taskId" element={<Bounty />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default App
