import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AgentStatusProvider } from './lib/agentStatus.tsx'
import { DisplayAssetProvider } from './lib/displayAsset.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AgentStatusProvider>
        <DisplayAssetProvider>
          <App />
        </DisplayAssetProvider>
      </AgentStatusProvider>
    </BrowserRouter>
  </StrictMode>,
)
