/**
 * THE DIFFICULTY RAMP, measured: what a competent draft's chances are at every level of the
 * ladder, tier by tier.
 *
 *   npm run balance            the whole ladder, 40 drafts a level
 *   npm run balance -- 100     more drafts a level (slower, tighter numbers)
 *
 * The player is modelled the way a person actually plays the campaign draft: five spins of the
 * wheel, and at each spin the best available man who can fill a slot still open — Draft.tsx's own
 * wheel (`landOn` over WHEEL) and its own position rules, no staff nodes, no tactics, naive
 * defensive assignment. That is the FLOOR of competent play, not the ceiling: a player who uses
 * respins, the decade widener or a manual board does better than these numbers.
 *
 * What comes out is the per-level series win probability, and per tier the median, the softest
 * level and the hardest. A tier whose median sits near 50% is a fair climb; a tier that ends in
 * the twenties is a wall, and this is the report that says so.
 */
import CAMPAIGNS from '../src/data/campaigns.json'
import { WHEEL, type TeamSeason } from '../src/data/wheel'
import { SIGMA } from '../src/config'
import { odds } from '../src/engine/odds'
import { compile } from '../src/engine/resolver'
import { PLAYERS } from '../src/engine/pool'
import { eligible, POSITIONS, type Pos } from '../src/engine/positions'
import { makeRng } from '../src/engine/rng'
import type { Opponent, Player } from '../src/engine/types'

const STATS = JSON.parse(
  (await import('node:fs')).readFileSync(new URL('../src/data/stats.json', import.meta.url), 'utf8'),
) as Record<string, { pos?: string[] } | null>

const BY = new Map(PLAYERS.map((p) => [p.name, p]))
const bare = new Map(PLAYERS.map((p) => [p.name, p.player]))
const posOf = (n: string) => eligible(STATS[n]?.pos)

/**
 * TWO PLAYERS, because the ladder is long enough that they are different people.
 *
 *  BARE     no staff tree at all: the spin lands on one team-season and he takes the best man on
 *           that roster who fits an open slot. This is level 1 with nothing bought.
 *  STAFFED  the Front-office branch maxed — Division spin rank 2 opens the wheel to that season's
 *           whole CONFERENCE, so a spin offers fifteen rosters instead of one. By the time the
 *           ladder reaches the all-time tiers a player has earned far more stars than the branch
 *           costs, so THIS is the honest model of who is standing there, not the bare one.
 */
type Profile = 'bare' | 'staffed'
/** Every man in that season's conference — Draft.tsx's `widenRoster` at Division spin rank 2. */
function conference(t: TeamSeason): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of WHEEL) if (x.y === t.y && x.c === t.c) for (const n of x.p) if (!seen.has(n)) (seen.add(n), out.push(n))
  return out
}
function draft(seed: number, profile: Profile): Player[] {
  const rng = makeRng(seed)
  const slots: Partial<Record<Pos, string>> = {}
  const taken = new Set<string>()
  for (let pick = 0; pick < 5; pick++) {
    const open = POSITIONS.filter((x) => !slots[x])
    let roster: string[] | null = null
    for (let i = 0; i < 400 && !roster; i++) {
      const t = WHEEL[Math.floor(rng.next() * WHEEL.length)]
      const board = profile === 'staffed' ? conference(t) : t.p
      if (board.some((n) => BY.has(n) && !taken.has(bare.get(n)!) && posOf(n).some((x) => open.includes(x)))) roster = board
    }
    if (!roster) return []
    let best: { n: string; at: Pos } | null = null
    for (const n of roster) {
      const p = BY.get(n)
      if (!p || taken.has(bare.get(n)!)) continue
      for (const at of posOf(n)) {
        if (!open.includes(at)) continue
        if (!best || p.ovr > BY.get(best.n)!.ovr) best = { n, at }
      }
    }
    if (!best) return []
    slots[best.at] = best.n
    taken.add(bare.get(best.n)!)
  }
  return POSITIONS.map((x) => BY.get(slots[x]!)!).filter(Boolean)
}

// vite-node puts the script path in argv[2], so take the first argument that is actually a number.
const N = process.argv.slice(2).map(Number).find((n) => Number.isFinite(n) && n > 0) ?? 40
interface Tier {
  id: string
  name: string
  levels: Opponent[]
}
const tiers = CAMPAIGNS as unknown as Tier[]
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const pctS = (v: number) => `${(100 * v).toFixed(1)}%`

const winrate = (o: Opponent, round: number, profile: Profile) => {
  let sum = 0
  let n = 0
  for (let k = 0; k < N; k++) {
    const five = draft(round * 1_000_003 + k * 7919 + 1, profile)
    if (five.length !== 5) continue
    const mine = compile(five, o.players as Player[], 'naive')
    const theirs = compile(o.players as Player[], five)
    sum += odds(mine, theirs, SIGMA, 4).series
    n++
  }
  return n ? sum / n : NaN
}

console.log(`series odds a competent draft holds, ${N} drafts a level`)
console.log(`BARE = nothing bought · STAFFED = the Front-office branch maxed (the wheel opens a whole conference)\n`)
let round = 0
for (const t of tiers) {
  const per: { level: number; team: string; bare: number; staffed: number }[] = []
  for (const o of t.levels) {
    round++
    per.push({ level: round, team: o.team, bare: winrate(o, round, 'bare'), staffed: winrate(o, round, 'staffed') })
  }
  const soft = [...per].sort((a, b) => b.staffed - a.staffed).slice(0, 3)
  const hard = [...per].sort((a, b) => a.staffed - b.staffed).slice(0, 3)
  console.log(`${t.name}  L${per[0].level}-${per[per.length - 1].level}`)
  console.log(`  median  bare ${pctS(med(per.map((p) => p.bare)))}   staffed ${pctS(med(per.map((p) => p.staffed)))}`)
  console.log(`  first L${per[0].level} staffed ${pctS(per[0].staffed)}   last L${per[per.length - 1].level} staffed ${pctS(per[per.length - 1].staffed)}`)
  console.log(`  softest ${soft.map((s) => `L${s.level} ${s.team} ${pctS(s.staffed)}`).join(' · ')}`)
  console.log(`  hardest ${hard.map((s) => `L${s.level} ${s.team} ${pctS(s.staffed)}`).join(' · ')}`)
  for (const p of per) console.log(`    L${String(p.level).padStart(3)} ${p.team.padEnd(28)} bare ${pctS(p.bare).padStart(6)}   staffed ${pctS(p.staffed).padStart(6)}`)
  console.log()
}
