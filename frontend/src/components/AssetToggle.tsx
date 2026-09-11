import { useDisplayAsset } from '../lib/displayAsset'

// Global display-preference switch — flips which asset is shown as primary wherever a stat
// already has two real, independently-known values (see lib/displayAsset.tsx). Styled as an
// actual two-state switch rather than a dropdown, sized small enough to sit in the sidebar.
export default function AssetToggle() {
  const { displayAsset, setDisplayAsset } = useDisplayAsset()
  const isAdc = displayAsset === 'ADC'

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] tracking-wide text-dim uppercase">Show amounts in</span>
      <button
        type="button"
        role="switch"
        aria-checked={isAdc}
        onClick={() => setDisplayAsset(isAdc ? 'HBAR' : 'ADC')}
        className="relative inline-flex h-6 w-24 shrink-0 cursor-pointer items-center rounded-full border border-border bg-inset transition-colors"
      >
        <span
          className={`absolute top-0.5 h-5 w-11 rounded-full bg-heading shadow transition-transform duration-200 ${
            isAdc ? 'translate-x-0.5' : 'translate-x-[46px]'
          }`}
        />
        <span
          className={`z-10 flex-1 text-center text-[11px] font-semibold transition-colors ${isAdc ? 'text-bg' : 'text-dim'}`}
        >
          ADC
        </span>
        <span
          className={`z-10 flex-1 text-center text-[11px] font-semibold transition-colors ${isAdc ? 'text-dim' : 'text-bg'}`}
        >
          HBAR
        </span>
      </button>
    </div>
  )
}
