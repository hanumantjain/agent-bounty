import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AgentStatusProvider } from './lib/agentStatus.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AgentStatusProvider>
        <App />
      </AgentStatusProvider>
    </BrowserRouter>
  </StrictMode>,
)
