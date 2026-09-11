import type { ReactNode } from 'react'
import { TERM_DEFINITIONS, type GlossaryTerm } from '../lib/glossary'

// A short, hover/focus/long-press-accessible definition for a jargon term — a dotted
// underline plus the native `title` tooltip. Used where there's no room for a full caption
// sentence (tight badges, tags, milestone labels); where there IS room, prefer a plain
// caption instead, to match the app's existing convention.
export default function Term({ name, children }: { name: GlossaryTerm; children: ReactNode }) {
  return (
    <span className="cursor-help border-b border-dotted border-dim/60" title={TERM_DEFINITIONS[name]}>
      {children}
    </span>
  )
}
