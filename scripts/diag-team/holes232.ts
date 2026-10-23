/** recal_232: the 44 holed rosters — holes, any full strict board at all, alternate hole slots, one-step candidates. */
import { WHEEL } from '../../src/data/wheel'
import { PLAYERS } from '../../src/engine/pool'
import { startingFive } from '../../src/engine/bestfive'
import { eligible, POSITIONS } from '../../src/engine/positions'
import { LINES } from '../../src/ui/Stat'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const el = (p: Player) => eligible(LINES[p.name]?.pos)
let k = 0
for (const t of WHEEL) {
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  if (roster.length < 5) continue
  const sf = startingFive(roster).five
  if (sf.every(Boolean)) continue
  k++
  const holes = sf.map((p, i) => (p ? null : POSITIONS[i])).filter(Boolean)
  // any full strict board at all?
  let anyFull = false
  const used = new Set<string>()
  const walk = (i: number): boolean => {
    if (i === 5) return true
    for (const p of roster) {
      if (used.has(p.name) || !el(p).includes(POSITIONS[i])) continue
      used.add(p.name)
      if (walk(i + 1)) return true
      used.delete(p.name)
    }
    return false
  }
  anyFull = walk(0)
  // which slots can the strict 4 leave open in some legal arrangement?
  const chosen = sf.filter((p): p is Player => !!p)
  const openable = new Set<string>()
  const slots: (Player | null)[] = [null, null, null, null, null]
  const place = (idx: number) => {
    if (idx === chosen.length) {
      slots.forEach((s, i) => !s && openable.add(POSITIONS[i]))
      return
    }
    for (let s = 0; s < 5; s++) {
      if (slots[s] || !el(chosen[idx]).includes(POSITIONS[s])) continue
      slots[s] = chosen[idx]
      place(idx + 1)
      slots[s] = null
    }
  }
  place(0)
  const rest = roster.filter((p) => !chosen.includes(p))
  const hi = holes.map((h) => POSITIONS.indexOf(h as never))
  const cands = rest
    .filter((p) => el(p).some((x) => hi.some((h) => Math.abs(POSITIONS.indexOf(x) - h) === 1)))
    .sort((a, b) => b.ovr - a.ovr)
  console.log(
    `${String(k).padStart(2)} ${t.team} '${String(t.y).slice(2)} n${roster.length} hole[${holes.join(',')}] openable[${[...openable].join(',')}] anyFull=${anyFull}`,
  )
  console.log(`     strict: ${sf.map((p) => (p ? `${p.name}(${el(p).join('/')},${p.ovr})` : '—')).join(' · ')}`)
  console.log(`     one-step: ${cands.map((p) => `${p.name}(${el(p).join('/')},${p.ovr})`).join(', ') || 'NONE'}`)
  console.log(`     rest: ${rest.map((p) => `${p.name}(${el(p).join('/')},${p.ovr})`).join(', ')}`)
}
