import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface LastPayment {
  amount: number
  asset: 'HBAR' | 'ADC'
  identity: string
  at: number
}

interface AgentStatusValue {
  activeIdentity: string
  isRunning: boolean
  currentStep: string | null
  lastPayment: LastPayment | null
  setActiveIdentity: (identity: string) => void
  setRunning: (running: boolean) => void
  setCurrentStep: (step: string | null) => void
  recordPayment: (payment: LastPayment) => void
}

const AgentStatusContext = createContext<AgentStatusValue | null>(null)

const LAST_PAYMENT_KEY = 'agentbounty.lastPayment'

function loadLastPayment(): LastPayment | null {
  try {
    const raw = localStorage.getItem(LAST_PAYMENT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AgentStatusProvider({ children }: { children: ReactNode }) {
  const [activeIdentity, setActiveIdentity] = useState('researcher')
  const [isRunning, setRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState<string | null>(null)
  const [lastPayment, setLastPayment] = useState<LastPayment | null>(() => loadLastPayment())

  const recordPayment = (payment: LastPayment) => {
    setLastPayment(payment)
    try {
      localStorage.setItem(LAST_PAYMENT_KEY, JSON.stringify(payment))
    } catch {
      // localStorage unavailable — non-critical, skip persistence
    }
  }

  const value = useMemo(
    () => ({
      activeIdentity,
      isRunning,
      currentStep,
      lastPayment,
      setActiveIdentity,
      setRunning,
      setCurrentStep,
      recordPayment,
    }),
    [activeIdentity, isRunning, currentStep, lastPayment],
  )

  return <AgentStatusContext.Provider value={value}>{children}</AgentStatusContext.Provider>
}

export function useAgentStatus() {
  const ctx = useContext(AgentStatusContext)
  if (!ctx) throw new Error('useAgentStatus must be used within AgentStatusProvider')
  return ctx
}
