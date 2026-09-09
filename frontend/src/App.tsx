import { NavLink, Route, Routes } from 'react-router-dom'
import Bounties from './pages/Bounties'
import Agent from './pages/Agent'
import Execution from './pages/Execution'
import Bounty from './pages/Bounty'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <span className="brand">AgentBounty</span>
        <nav>
          <NavLink to="/" end>
            Marketplace
          </NavLink>
          <NavLink to="/agent">Agent Identity</NavLink>
          <NavLink to="/execution">Live Execution</NavLink>
          <NavLink to="/bounty">Bounty Details</NavLink>
        </nav>
      </header>
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
