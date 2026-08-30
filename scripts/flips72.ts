/** recal_72 — the full is_big flip list (the round demands it; the receipt carries the count
 *  and a bounded sample). Recomputes BOTH clauses from the shipped cards + lifetime positions. */
import { readFileSync } from 'node:fs'
import { PLAYERS } from '../src/engine/pool'
import type { StatLine } from '../src/engine/types'

const LINES = JSON.parse(readFileSync('src/data/stats.json', 'utf8')) as Record<string, StatLine | null>

const isBig = (p: (typeof PLAYERS)[number], fixed: boolean) => {
  const pos = LINES[p.name]?.pos ?? []
  if (pos.length && (pos.includes('PG') || pos.includes('SG')) && !(pos.includes('C') || pos.includes('PF'))) return false
  if (pos.length && (pos.includes('C') || pos.includes('PF')) && !(pos.includes('PG') || pos.includes('SG'))) return true
  const a = p.attrs
  const first = fixed ? a.rimprot >= 55 && a['3pt'] < 45 && a.rimprot >= a.perdef : a.rimprot >= 55 && a['3pt'] < 45
  return first || (a.rim >= 60 && a['3pt'] < 40) || a.rimprot >= 80
}

const flips = PLAYERS.filter((p) => isBig(p, false) !== isBig(p, true))
console.log(`is_big flips under the recal_72 clause: ${flips.length}`)
for (const p of flips.sort((a, b) => b.attrs.perdef - b.attrs.rimprot - (a.attrs.perdef - a.attrs.rimprot)).reverse())
  console.log(`  ${p.name.padEnd(28)} pos ${(LINES[p.name]?.pos ?? []).join(',').padEnd(9)} rimprot ${String(p.attrs.rimprot).padStart(2)} perdef ${String(p.attrs.perdef).padStart(2)}  D ${p.d_ovr}  (shipped card already reflects the fix)`)
