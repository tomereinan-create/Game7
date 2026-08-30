/** r64 snapshot: cards + the 2026 team OFF leaderboard (before/after tool). */
import { PLAYERS } from '../src/engine/pool'
import { ratings100 } from '../src/engine/offense'
import { startingFive } from '../src/ui/TeamDb'
import { WHEEL } from '../src/ui/Draft'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
for (const n of ["Luguentz Dort '26", "Cason Wallace '26", "Isaiah Joe '26", "Shai Gilgeous-Alexander '26"]) {
  const p = BY.get(n)
  console.log(p ? `${n}: OVR ${p.ovr} O ${p.o_ovr} D ${p.d_ovr} (3pt ${p.attrs['3pt']} vol ${p.attrs.volume} eff ${p.attrs.efficiency})` : `${n}: MISSING`)
}
const rows = WHEEL.filter((t) => t.y === 2026).map((t) => {
  const five = startingFive(t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)).five.filter((p): p is Player => !!p)
  const r = five.length === 5 ? ratings100(five) : null
  return { team: t.team, rec: t.rec, off: r?.offRaw ?? 0, o100: r?.off ?? 0 }
})
rows.sort((a, b) => b.off - a.off)
rows.forEach((r, i) => console.log(`${String(i + 1).padStart(2)} ${r.team.padEnd(28)} ${r.rec ?? ''}  offRaw ${r.off.toFixed(2)}  dial ${r.o100}`))
