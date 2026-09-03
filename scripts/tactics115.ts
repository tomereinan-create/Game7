/** recal_115 design probe — the best-fit TACTIC picker, read over the whole wheel. Read-only.
 *
 *  His rulings: "Why is the system helio for rus when KD is a better scorrer? And in general, why
 *  Helio when they have 2 superstars? Other find a more fitting one, adjust the bonuses, or create
 *  a new system." · "How come Boston post up and not 5 out?"
 *
 *  Prints, for every team-season on the wheel that can field a five: the style bestStyle reads, the
 *  men the shape features (engine's own `featured`, the same function the court and the caption
 *  read), and the fit — then the DISTRIBUTION, which is how the round was judged. The five-out
 *  formula was rewritten because this probe measured it winning on ONE of 1,255 fives; re-run it
 *  after any change to styleFit or to the attributes it reads.
 *
 *    npx vite-node scripts/tactics115.ts             the distribution + the named fives
 *    npx vite-node scripts/tactics115.ts --all       every team-season, one line each
 *    npx vite-node scripts/tactics115.ts --fits      the named fives with every man and every fit
 */
import { WHEEL } from '../src/data/wheel'
import { startingFive } from '../src/engine/bestfive'
import { PLAYERS } from '../src/engine/pool'
import { bestStyle, featured, scorerCreator, STYLES, styleFit, twoStars, type Style } from '../src/engine/tactics'
import type { Player } from '../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
type Row = { key: string; five: Player[]; style: Style; fit: number; man: string }
const rows: Row[] = []
for (const t of WHEEL) {
  const roster = t.p.map((n) => BY.get(n)).filter((p): p is Player => !!p)
  if (roster.length < 5) continue
  const five = startingFive(roster).five.filter((p): p is Player => !!p)
  if (five.length < 5) continue
  const b = bestStyle(five)
  rows.push({ key: `${t.y} ${t.team}`, five, style: b.style, fit: b.fit, man: featured(b.style, five).map((p) => p.name).join(' + ') })
}

console.log(`team-seasons with a full five: ${rows.length}`)
const dist = new Map<string, number>()
for (const r of rows) dist.set(r.style, (dist.get(r.style) ?? 0) + 1)
for (const s of STYLES) {
  const n = dist.get(s.key) ?? 0
  console.log(`  ${s.key.padEnd(12)} ${String(n).padStart(5)}  ${((100 * n) / rows.length).toFixed(1)}%`)
}
console.log(`  ${'(two stars)'.padEnd(12)} ${String(rows.filter((r) => twoStars(r.five)).length).padStart(5)}  fives whose top two scorer-creators are both stars`)

if (process.argv.includes('--all')) {
  for (const r of [...rows].sort((a, b) => a.key.localeCompare(b.key)))
    console.log(`${r.key.padEnd(30)} ${r.style.padEnd(11)} ${r.fit.toFixed(1).padStart(5)}  ${r.man}`)
}

/** The fives the round reports on: (year, franchise) as they appear on the wheel. */
const NAMED: [number, string][] = [
  [2016, 'Oklahoma City Thunder'],
  [2022, 'Oklahoma City Thunder'],
  [2025, 'Boston Celtics'],
  [2024, 'Boston Celtics'],
  [2017, 'Golden State Warriors'],
  [2016, 'Golden State Warriors'],
  [1996, 'Chicago Bulls'],
  [2000, 'Los Angeles Lakers'],
  [2001, 'Los Angeles Lakers'],
  [2018, 'Houston Rockets'],
  [2016, 'Cleveland Cavaliers'],
  [2013, 'Miami Heat'],
  [2005, 'Phoenix Suns'],
  [1997, 'Utah Jazz'],
  [2023, 'Denver Nuggets'],
  [2014, 'San Antonio Spurs'],
  [1994, 'Houston Rockets'],
]
console.log('\nNAMED FIVES')
for (const [y, team] of NAMED) {
  const r = rows.find((x) => x.key === `${y} ${team}`)
  if (!r) {
    console.log(`${y} ${team}: NOT ON THE WHEEL`)
    continue
  }
  console.log(`${`${y} ${team}`.padEnd(30)} ${r.style.toUpperCase().padEnd(11)} fit ${r.fit.toFixed(0).padStart(3)}  ${r.man}${twoStars(r.five) ? '   [two stars]' : ''}`)
  if (process.argv.includes('--fits')) {
    for (const p of r.five)
      console.log(
        `    ${p.name.padEnd(28)} sc ${scorerCreator(p.attrs).toFixed(1).padStart(5)}  3pt${String(p.attrs['3pt']).padStart(3)} rim${String(p.attrs.rim).padStart(3)} mid${String(p.attrs.mid).padStart(3)} vol${String(p.attrs.volume).padStart(3)} pv${String(p.attrs.playvol).padStart(3)} eff${String(p.attrs.efficiency).padStart(3)} bs${String(p.attrs.ballsec).padStart(3)} h${p.attrs.height}`,
      )
    console.log(`    ${STYLES.map((s) => `${s.key} ${styleFit(s.key, r.five).toFixed(0)}`).join('  ')}`)
  }
}
