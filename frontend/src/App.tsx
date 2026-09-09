import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import Bounties from './pages/Bounties'
import Agent from './pages/Agent'
import Execution from './pages/Execution'
import Bounty from './pages/Bounty'
import { useAgentStatus } from './lib/agentStatus'

const NAV_ITEMS = [
  { to: '/', label: 'Bounty Marketplace', icon: '◆', end: true },
  { to: '/agent', label: 'Agent Identity', icon: '◈', end: false },
  { to: '/execution', label: 'Live Execution', icon: '▶', end: false },
  { to: '/bounty', label: 'Bounty Details', icon: '▤', end: false },
]

function App() {
  const { activeIdentity, isRunning } = useAgentStatus()
  const [subname, setSubname] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/bounty/identity/${activeIdentity}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSubname(data?.subname ?? null))
      .catch(() => setSubname(null))
  }, [activeIdentity])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-bg/80 px-4 py-3 backdrop-blur-sm lg:px-8">
        <button
          className="rounded-md p-1.5 text-dim hover:bg-white/5 hover:text-heading lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          ☰
        </button>
        <div className="hidden lg:block" />
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-2 rounded-lg border border-border-soft bg-inset px-3 py-1.5 text-xs text-muted shadow-sm shadow-black/20">
            <span className={isRunning ? 'pulse-dot' : 'inline-flex h-2 w-2 rounded-full bg-dim'} />
            <span className="font-mono">{subname ?? `${activeIdentity}…`}</span>
          </span>
          <span className="tag">Hedera Testnet</span>
        </div>
      </header>

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
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-white to-zinc-400 text-base font-bold text-bg shadow-lg shadow-black/40">
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
            <div className="flex items-center gap-2 px-1 text-[11px] text-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-dim" /> ENSv2
              <span className="h-1.5 w-1.5 rounded-full bg-dim" /> The Graph
              <span className="h-1.5 w-1.5 rounded-full bg-dim" /> Hedera
            </div>
            <div className="rounded-xl border border-border-soft bg-inset p-3 shadow-sm shadow-black/20">
              <div className="text-[10px] tracking-wide text-dim uppercase">Bounty Manager</div>
              <div className="mt-0.5 truncate font-mono text-[13px] font-medium text-heading">agentbounty.eth</div>
              <div className="mt-1 text-[11px] text-dim">Checks submissions, releases rewards</div>
            </div>
            <div className="rounded-xl border border-border-soft bg-inset p-3 shadow-sm shadow-black/20">
              <div className="mb-1 truncate font-mono text-[13px] font-medium text-heading">
                {subname ?? `${activeIdentity}.eth`}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-live">
                <span className="pulse-dot" /> Agent Online
              </div>
              <div className="mt-2 text-[11px] tracking-wide text-dim uppercase">ENSv2 Protected</div>
            </div>
          </div>
        </aside>

        <main className="h-full min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
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
