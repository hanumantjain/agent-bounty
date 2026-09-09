import { NavLink, Route, Routes } from 'react-router-dom'
import Bounties from './pages/Bounties'
import Agent from './pages/Agent'
import Execution from './pages/Execution'
import Bounty from './pages/Bounty'

const NAV_ITEMS = [
  { to: '/', label: 'Bounty Marketplace', icon: '◆', end: true },
  { to: '/agent', label: 'Agent Identity', icon: '◈', end: false },
  { to: '/execution', label: 'Live Execution', icon: '▶', end: false },
  { to: '/bounty', label: 'Bounty Details', icon: '▤', end: false },
]

function App() {
  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside className="flex h-full min-h-0 w-60 shrink-0 flex-col gap-8 overflow-y-auto border-r border-border p-6">
        <div className="flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-accent to-accent-2 text-base font-bold text-white">
            A
          </span>
          <span className="text-[17px] font-bold text-heading">
            Agent
            <span className="bg-gradient-to-br from-accent to-accent-2 bg-clip-text text-transparent">Bounty</span>
          </span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-item">
              <span className="w-4.5 text-center text-[13px] text-accent">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border p-3">
          <div className="flex items-center gap-2 text-xs whitespace-nowrap text-dim">
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent-2" /> ENSv2
          </div>
          <div className="flex items-center gap-2 text-xs whitespace-nowrap text-dim">
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent" /> The Graph
          </div>
          <div className="flex items-center gap-2 text-xs whitespace-nowrap text-dim">
            <span className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-dim" /> Hedera
          </div>
        </div>
      </aside>
      <main className="h-full min-h-0 flex-1 overflow-y-auto px-12 py-10">
        <Routes>
          <Route path="/" element={<Bounties />} />
          <Route path="/agent" element={<Agent />} />
          <Route path="/execution" element={<Execution />} />
          <Route path="/bounty" element={<Bounty />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
