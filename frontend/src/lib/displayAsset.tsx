import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

// A site-wide display preference: whenever a stat already has two real, independently-known
// values (e.g. the data endpoint's own HBAR price and its own ADC price — never a currency
// conversion of one into the other, since there's no live exchange rate anywhere in this app),
// this decides which one is shown as primary. It never changes what a specific bounty's reward
// actually is — a bounty is funded in exactly one real asset, and always shows that one,
// regardless of this preference.
type DisplayAsset = 'ADC' | 'HBAR'

interface DisplayAssetValue {
  displayAsset: DisplayAsset
  setDisplayAsset: (asset: DisplayAsset) => void
}

const DisplayAssetContext = createContext<DisplayAssetValue | null>(null)

const DISPLAY_ASSET_KEY = 'agentbounty.displayAsset'

function loadDisplayAsset(): DisplayAsset {
  try {
    const raw = localStorage.getItem(DISPLAY_ASSET_KEY)
    return raw === 'HBAR' ? 'HBAR' : 'ADC'
  } catch {
    return 'ADC'
  }
}

export function DisplayAssetProvider({ children }: { children: ReactNode }) {
  const [displayAsset, setDisplayAssetState] = useState<DisplayAsset>(() => loadDisplayAsset())

  const setDisplayAsset = (asset: DisplayAsset) => {
    setDisplayAssetState(asset)
    try {
      localStorage.setItem(DISPLAY_ASSET_KEY, asset)
    } catch {
      // localStorage unavailable — non-critical, skip persistence
    }
  }

  const value = useMemo(() => ({ displayAsset, setDisplayAsset }), [displayAsset])

  return <DisplayAssetContext.Provider value={value}>{children}</DisplayAssetContext.Provider>
}

export function useDisplayAsset() {
  const ctx = useContext(DisplayAssetContext)
  if (!ctx) throw new Error('useDisplayAsset must be used within DisplayAssetProvider')
  return ctx
}
