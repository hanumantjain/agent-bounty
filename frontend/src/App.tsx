import { NavLink, Route, Routes } from 'react-router-dom'
import Bounties from './pages/Bounties'
import Agent from './pages/Agent'
import Execution from './pages/Execution'
import Bounty from './pages/Bounty'
import './App.css'

const NAV_ITEMS = [
  { to: '/', label: 'Bounty Marketplace', icon: '◆', end: true },
  { to: '/agent', label: 'Agent Identity', icon: '◈', end: false },
  { to: '/execution', label: 'Live Execution', icon: '▶', end: false },
  { to: '/bounty', label: 'Bounty Details', icon: '▤', end: false },
]

function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <span className="brand-name">
            Agent<span className="brand-accent">Bounty</span>
          </span>
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-item">
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="tech-badge">
            <span className="tech-dot tech-ens" /> ENSv2
          </div>
          <div className="tech-badge">
            <span className="tech-dot tech-graph" /> The Graph
          </div>
          <div className="tech-badge">
            <span className="tech-dot tech-hedera" /> Hedera
          </div>
        </div>
      </aside>
      <main>
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
