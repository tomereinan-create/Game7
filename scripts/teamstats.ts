/**
 * Builds src/data/teamstats.json — THE TEAM'S REAL BOX-SCORE LINE, per season.
 *
 * HIS RULING, 2026-09-21: "add more(as many as possible) real (basic, not advanced) stats on the
 * team from basketball ref". Basic means the per-game table Basketball Reference prints on a
 * team's own page — points, the three shooting splits, the boards, the assists, the steals, the
 * blocks, the turnovers, the fouls — and NOT the rating/pace/factor table beside it, which is the
 * advanced one and which the app already has its own opinions about.
 *
 * WHERE THE NUMBERS COME FROM, and why this is the real thing rather than an estimate: a team's
 * season totals ARE the sum of its players' season totals. `Player Totals.csv` carries one row per
 * player per TEAM STINT, so summing every row of a (season, team) gives that team's own totals
 * exactly — which is how Basketball Reference's team row is computed in the first place. The rows
 * a traded man also gets under `TOT`/`2TM`/`3TM` are the sum of his stints and are skipped, or
 * every such player would be counted twice.
 *
 * TWO THINGS COME FROM `Team Summaries.csv` INSTEAD, because no player row holds them:
 *   · GAMES — w + l, which is the divisor for every per-game figure below. A season's totals over
 *     82 is not the same as over a strike-shortened 50 (1999) or 66 (2012), and both are in range.
 *   · MARGIN OF VICTORY — the one number that knows what the OTHER team scored. Opponent points
 *     per game is PTS/G minus MOV, which is arithmetic, not a model.
 *
 * AND WHAT THE OTHER SIDE DID comes from `Opponent Totals.csv`, which is Basketball Reference's
 * own opponent table for each season, fetched once by scripts/fetch-opponents.ts. It cannot be
 * summed out of this repo's player rows — a player's totals are his own, never his opponents' —
 * and it cannot be solved out of the four factors either, so it is the one part of this file that
 * came off the wire. Its rows name teams in full, which `Team Summaries.csv` turns into the same
 * abbreviations everything else here is keyed by.
 *
 * The file is an object keyed `${abbreviation}${season}` — the same key `seasonId` builds in the
 * team database — holding TOTALS, not averages: the app divides by `g` itself, so a per-game
 * figure and a percentage are computed from the same integers the league keeps, and nothing is
 * rounded twice. The fifteen team totals come first and the fifteen opponent totals after them,
 * in the same order.
 *
 *   npm run teamstats
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = process.argv[2] ?? join(here, '..', 'data', 'bref')
for (const f of ['Player Totals.csv', 'Team Summaries.csv', 'Opponent Totals.csv']) {
  if (!existsSync(join(dir, f))) {
    console.error(`missing ${f} in ${dir}`)
    process.exit(1)
  }
}

/** CSV rows here have no embedded commas in the fields we read, but quote-safe splitting is cheap. */
function split(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i++
      } else q = !q
    } else if (c === ',' && !q) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

function rows(file: string): { head: Record<string, number>; data: string[][] } {
  const lines = readFileSync(join(dir, file), 'utf8').split(/\r?\n/).filter((l) => l.trim())
  const head: Record<string, number> = {}
  split(lines[0]).forEach((h, i) => (head[h.trim()] = i))
  return { head, data: lines.slice(1).map(split) }
}

/** 1980 is the first season the app holds — and the first with a three-point line. */
const FROM = 1980
/** The combined rows a traded player also appears under; his stints are already counted. */
const COMBINED = new Set(['TOT', '2TM', '3TM', '4TM', '5TM'])

/** The totals every line is built from, in the order they are written to the file. */
const KEYS = ['fg', 'fga', 'x3p', 'x3pa', 'ft', 'fta', 'orb', 'drb', 'trb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pts'] as const
type Key = (typeof KEYS)[number]

const totals = new Map<string, Record<Key, number>>()
{
  const { head, data } = rows('Player Totals.csv')
  for (const r of data) {
    const season = Number(r[head.season])
    if (!Number.isFinite(season) || season < FROM) continue
    if (r[head.lg] !== 'NBA') continue
    const team = r[head.team]
    if (!team || COMBINED.has(team)) continue
    const key = `${team}${season}`
    let acc = totals.get(key)
    if (!acc) {
      acc = Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<Key, number>
      totals.set(key, acc)
    }
    for (const k of KEYS) {
      const v = Number(r[head[k]])
      if (Number.isFinite(v)) acc[k] += v
    }
  }
}

/** games and margin of victory, the two figures no player row holds */
const games = new Map<string, number>()
const mov = new Map<string, number>()
{
  const { head, data } = rows('Team Summaries.csv')
  for (const r of data) {
    const season = Number(r[head.season])
    if (!Number.isFinite(season) || season < FROM) continue
    if (r[head.lg] !== 'NBA') continue
    const ab = r[head.abbreviation]
    if (!ab) continue
    const w = Number(r[head.w])
    const l = Number(r[head.l])
    const key = `${ab}${season}`
    if (Number.isFinite(w) && Number.isFinite(l) && w + l > 0) games.set(key, w + l)
    const m = Number(r[head.mov])
    if (Number.isFinite(m)) mov.set(key, m)
  }
}

/** the full club name, per season, so the opponent table's rows can be keyed like everything else */
const abOf = new Map<string, string>()
{
  const { head, data } = rows('Team Summaries.csv')
  for (const r of data) {
    const season = Number(r[head.season])
    if (!Number.isFinite(season) || season < FROM || r[head.lg] !== 'NBA') continue
    const name = r[head.team]?.replace(/\*+$/, '').trim()
    const ab = r[head.abbreviation]
    if (name && ab) abOf.set(`${name}|${season}`, ab)
  }
}

/** WHAT THE OTHER SIDE DID — Basketball Reference's own opponent totals (see fetch-opponents.ts). */
const against = new Map<string, number[]>()
{
  const { head, data } = rows('Opponent Totals.csv')
  const cols = KEYS.map((k) => head[`opp_${k === 'x3p' ? 'fg3' : k === 'x3pa' ? 'fg3a' : k}`])
  for (const r of data) {
    const season = Number(r[head.season])
    if (!Number.isFinite(season)) continue
    const name = r[head.team]?.replace(/^"|"$/g, '').replace(/\*+$/, '').trim()
    const ab = abOf.get(`${name}|${season}`)
    if (!ab) {
      console.error(`opponent row with no abbreviation: ${name} ${season}`)
      continue
    }
    against.set(`${ab}${season}`, cols.map((i) => Math.round(Number(r[i]) || 0)))
  }
}

/** `[g, mov, ...KEYS, ...KEYS against]`, integers — the app does every division. */
const out: Record<string, number[]> = {}
let skipped = 0
let noOpp = 0
for (const [key, acc] of totals) {
  const g = games.get(key)
  if (!g) {
    skipped++
    continue
  }
  const opp = against.get(key)
  if (!opp) noOpp++
  out[key] = [g, +(mov.get(key) ?? 0).toFixed(2), ...KEYS.map((k) => Math.round(acc[k])), ...(opp ?? [])]
}

const dest = join(here, '..', 'src', 'data', 'teamstats.json')
writeFileSync(dest, JSON.stringify(out), 'utf8')

const seasons = [...Object.keys(out)].map((k) => Number(k.slice(-4)))
console.log(
  `teamstats: ${Object.keys(out).length} team-seasons, ${Math.min(...seasons)}–${Math.max(...seasons)}` +
    `${skipped ? `, ${skipped} without a summary row` : ''}${noOpp ? `, ${noOpp} without an opponent row` : ''}`,
)
const probe = out['GSW2016']
if (probe) {
  const [g, m, ...t] = probe
  const at = (k: Key) => t[KEYS.indexOf(k)]
  const opp = (k: Key) => t[KEYS.length + KEYS.indexOf(k)]
  console.log(`  GSW 2016: ${g} games, ${(at('pts') / g).toFixed(1)} pts, ${(at('trb') / g).toFixed(1)} reb, ${(at('ast') / g).toFixed(1)} ast, ${(at('fg') / at('fga')).toFixed(3)} fg%`)
  console.log(`  allowed:  ${(opp('pts') / g).toFixed(1)} pts (mov says ${(at('pts') / g - m).toFixed(1)}), ${(opp('trb') / g).toFixed(1)} reb, ${(opp('fg') / opp('fga')).toFixed(3)} fg%`)
}
