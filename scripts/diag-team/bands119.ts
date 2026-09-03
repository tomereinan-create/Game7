/**
 * recal_119 — the four archetype lineups tests/offense.test.ts pins, with the possession channel
 * broken out, so the band re-pin is a reading rather than a claim.
 *
 *   npx vite-node scripts/diag-team/bands119.ts
 */
import { KNOBS, creation, teamOffense } from '../../src/engine/offense'
import { PLAYERS } from '../../src/engine/pool'
import type { Player } from '../../src/engine/types'

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const five = (...n: string[]) => n.map((x) => BY.get(x)!).filter(Boolean) as Player[]
const L: Record<string, Player[]> = {
  GOAT5: five("Michael Jordan '88", "LeBron James '09", "Stephen Curry '16", "Shaquille O'Neal '00", "Giannis Antetokounmpo '20"),
  BALANCED: five("Stephen Curry '16", "LeBron James '09", "Kyle Korver '15", "Shane Battier '06", "Rudy Gobert '19"),
  ROLE5: five("Kyle Korver '15", "Shane Battier '06", "Bruce Bowen '06", "P.J. Tucker '14", "Rudy Gobert '19"),
  CHUCK5: five("Allen Iverson '01", "Russell Westbrook '17", "DeMar DeRozan '21", "Carmelo Anthony '14", "Trae Young '22"),
}
for (const [nm, l] of Object.entries(L)) {
  const o = teamOffense(l)
  const wball = o.lines.reduce((s, ln, i) => s + ln.usg * l[i].attrs.ballsec, 0) / KNOBS.TEAM_USG
  console.log(
    `${nm.padEnd(10)} off ${o.off.toFixed(2)}  tovMult ${o.tovMult.toFixed(4)} (${((o.off - o.off / o.tovMult)).toFixed(2)} pts)  wball ${wball.toFixed(1)}  feed ${(l.reduce((s, p, i) => s + creation(p.attrs) * o.lines[i].usg, 0) / 100).toFixed(3)}`,
  )
  console.log('           ' + l.map((p, i) => `${p.name.split(' ').slice(-1)[0]} ${p.attrs.ballsec}@${o.lines[i].usg}`).join(' · '))
}
const off = (l: Player[]) => teamOffense(l).off
console.log(`\nGOAT5 - BALANCED = ${(off(L.GOAT5) - off(L.BALANCED)).toFixed(2)}`)
console.log(`chuck ${off(L.CHUCK5).toFixed(1)} < bal ${off(L.BALANCED).toFixed(1)} : ${off(L.CHUCK5) < off(L.BALANCED)}`)
console.log(`chuck < goat ${off(L.GOAT5).toFixed(1)} : ${off(L.CHUCK5) < off(L.GOAT5)}`)
console.log(`role  ${off(L.ROLE5).toFixed(1)} < goat : ${off(L.ROLE5) < off(L.GOAT5)}   role < bal : ${off(L.ROLE5) < off(L.BALANCED)}`)
