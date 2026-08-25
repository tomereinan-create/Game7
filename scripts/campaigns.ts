/**
 * Builds src/data/campaigns.json: four 30-level campaigns, one per era —
 * the most recent season, 2020–2025, 2010–2019, 2000–2009 — each ordered
 * worst record (level 1) to best, with the era's champions as the last
 * levels. src/data/opponents.json keeps the first tier for the tests. A team's five is its five highest-minute qualified
 * players that season that can cover PG · SG · SF · PF · C by their lifetime
 * Basketball-Reference positions — its actual rotation, numbers straight from
 * the pool, listed PG to C.
 *
 *   npm run opponents
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eligible } from '../src/engine/positions'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_BREF = join(here, '..', 'data', 'bref')   // the CSVs live in the repo now
const DEFAULT_DIR = existsSync(REPO_BREF)
  ? REPO_BREF
  : join(process.env.LOCALAPPDATA ?? '', 'Temp/claude/C--Users-tomer-Desktop/213b1108-7de9-4ece-b091-d21781a1f07f/scratchpad/bref')
const dir = process.argv[2] ?? DEFAULT_DIR
if (!existsSync(join(dir, 'Team Summaries.csv'))) {
  console.error(`missing Team Summaries.csv in ${dir}`)
  process.exit(1)
}

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
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length)
  const head = split(lines[0])
  return lines.slice(1).map((l) => {
    const cells = split(l)
    const o: Record<string, string> = {}
    head.forEach((h, i) => (o[h] = cells[i] ?? ''))
    return o
  })
}

interface P {
  name: string
  player: string
  peak_season: number
  in: number
  out: number
  id: number
  pd: number
  [k: string]: unknown
}
interface TS {
  y: number
  c: 'E' | 'W'
  team: string
  ab: string
  p: string[]
}
const players = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'players_stats.json'), 'utf8')) as P[]
const byName = new Map(players.map((p) => [p.name, p]))
const stats = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'stats.json'), 'utf8')) as Record<
  string,
  { gp?: number; mpg?: number; pos?: string[] } | null
>
const wheel = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'teamseasons.json'), 'utf8')) as TS[]

// The most recent season the pool has.
const SEASON = Math.max(...wheel.map((t) => t.y))

/** (season, abbreviation) -> record, every NBA season in the data. */
const records = new Map<string, { w: number; l: number }>()
const rk = (y: number, ab: string) => `${y}|${ab}`
for (const r of parseCsv(readFileSync(join(dir, 'Team Summaries.csv'), 'utf8'))) {
  if (r.lg !== 'NBA' || !r.abbreviation || r.abbreviation === 'NA') continue
  const w = Number(r.w)
  const l = Number(r.l)
  if (Number.isFinite(w) && Number.isFinite(l)) records.set(rk(Number(r.season), r.abbreviation), { w, l })
}

const minutes = (n: string) => {
  const s = stats[n]
  return s && s.gp && s.mpg ? s.gp * s.mpg : 0
}


const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
type P5 = (typeof POS)[number]
const strict = (n: string): P5[] => eligible(stats[n]?.pos)
/** One step over: a guard can slide a slot, a big can slide a slot. */
const loose = (n: string): P5[] => {
  const out = new Set<P5>()
  for (const p of strict(n)) {
    const i = POS.indexOf(p)
    out.add(p)
    if (i > 0) out.add(POS[i - 1])
    if (i < 4) out.add(POS[i + 1])
  }
  return [...out]
}
const any = (): P5[] => [...POS]

/**
 * The highest-minute five that can cover every position, in PG..C order.
 * Walks the rotation from the top: among fives drawn from the first k players
 * (k = 5, 6, 7, ...) takes the one with the most minutes that has a perfect
 * position matching. Returns null only if the whole roster can't cover.
 */
function lineup(ranked: string[]): { names: string[]; fit: 'strict' | 'loose' | 'any' } | null {
  for (const [fit, canPlay] of [['strict', strict], ['loose', loose], ['any', any]] as const) {
    const got = lineupWith(ranked, canPlay)
    if (got) return { names: got, fit }
  }
  return null
}
function lineupWith(ranked: string[], canPlay: (n: string) => P5[]): string[] | null {
  const assign = (names: string[]): string[] | null => {
    const order = new Array<string>(5)
    const used = new Set<string>()
    const go = (i: number): boolean => {
      if (i === 5) return true
      for (const n of names) {
        if (used.has(n) || !canPlay(n).includes(POS[i])) continue
        used.add(n)
        order[i] = n
        if (go(i + 1)) return true
        used.delete(n)
      }
      return false
    }
    return go(0) ? order : null
  }
  for (let k = 5; k <= ranked.length; k++) {
    const head = ranked.slice(0, k)
    // all 5-subsets of head that include the k-th player (new ones only), best minutes first
    const subsets: string[][] = []
    const pick = (start: number, acc: string[]) => {
      if (acc.length === 5) {
        subsets.push(acc)
        return
      }
      for (let j = start; j < head.length; j++) pick(j + 1, [...acc, head[j]])
    }
    pick(0, [])
    subsets.sort((a, b) => b.reduce((s, n) => s + minutes(n), 0) - a.reduce((s, n) => s + minutes(n), 0))
    for (const s of subsets) {
      const a = assign(s)
      if (a) return a
    }
  }
  return null
}

/** NBA champions by season (the year the Finals were played), dataset abbreviations. */
const CHAMPS: Record<number, string> = {
  2000: 'LAL', 2001: 'LAL', 2002: 'LAL', 2003: 'SAS', 2004: 'DET', 2005: 'SAS', 2006: 'MIA', 2007: 'SAS', 2008: 'BOS', 2009: 'LAL',
  2010: 'LAL', 2011: 'DAL', 2012: 'MIA', 2013: 'MIA', 2014: 'SAS', 2015: 'GSW', 2016: 'CLE', 2017: 'GSW', 2018: 'GSW', 2019: 'TOR',
  2020: 'LAL', 2021: 'MIL', 2022: 'GSW', 2023: 'DEN', 2024: 'BOS', 2025: 'OKC',
}

interface Tier {
  id: string
  name: string
  years: [number, number]
  /** Points of spread the opponent gets, the era's difficulty. */
  handicap: number
  blurb: string
}
const TIERS: Tier[] = [
  { id: 'c2026', name: 'Campaign', years: [SEASON, SEASON], handicap: 0, blurb: "Last season's league, worst record first." },
  { id: 'c2020s', name: 'The 2020s', years: [2020, 2025], handicap: 1, blurb: 'Thirty teams from 2020–2025; the six champions wait at the top.' },
  { id: 'c2010s', name: 'The 2010s', years: [2010, 2019], handicap: 2, blurb: 'Thirty teams from 2010–2019; ten champions at the top.' },
  { id: 'c2000s', name: 'The 2000s', years: [2000, 2009], handicap: 3, blurb: 'Thirty teams from 2000–2009; ten champions at the top.' },
]

interface Built {
  team: string
  ab: string
  y: number
  five: P[]
  w: number
  l: number
  champ: boolean
}
function build(t: TS): Built | null {
  const rec = records.get(rk(t.y, t.ab))
  if (!rec) return null
  const ranked = [...t.p].filter((n) => byName.has(n)).sort((a, b) => minutes(b) - minutes(a))
  const lined = lineup(ranked)
  if (!lined) return null
  return { team: t.team, ab: t.ab, y: t.y, five: lined.names.map((n) => byName.get(n)!), w: rec.w, l: rec.l, champ: CHAMPS[t.y] === t.ab }
}
const pct = (b: Built) => b.w / (b.w + b.l)

/**
 * A tier: the era's champions are the last levels (worst champion record
 * first); the rest of the thirty are non-champions spread evenly across the
 * era's record range (every team-season once), worst first.
 */
function tierLevels(tier: Tier) {
  const pool = wheel
    .filter((t) => t.y >= tier.years[0] && t.y <= tier.years[1])
    .map(build)
    .filter((b): b is Built => !!b && b.five.length === 5)
  const champs = pool.filter((b) => b.champ).sort((a, b) => pct(a) - pct(b))
  const others = pool.filter((b) => !b.champ).sort((a, b) => pct(a) - pct(b))
  const need = 30 - champs.length
  const picked: Built[] = []
  if (tier.years[0] === tier.years[1]) picked.push(...others) // one season: everyone plays
  else for (let i = 0; i < need; i++) picked.push(others[Math.round((i * (others.length - 1)) / Math.max(1, need - 1))])
  const levels = [...picked.slice(0, need), ...champs]
  return levels.map((b, i) => ({
    round: i + 1,
    team: tier.years[0] === tier.years[1] ? b.team : `${String(b.y).slice(2).padStart(2, '0')} ${b.team}`.replace(/^(\d\d) /, (_m, yy) => `'${yy} `),
    ab: b.ab,
    season: b.y,
    champion: b.champ,
    record: `${b.w}–${b.l}`,
    positions: [...POS],
    players: b.five,
  }))
}

const campaigns = TIERS.map((tier) => {
  const levels = tierLevels(tier)
  console.log(`\n${tier.name} (${tier.years.join('–')}) · ${levels.length} levels · ${levels.filter((l) => l.champion).length} champions`)
  for (const l of levels) console.log(`  L${String(l.round).padStart(2)} ${l.team.padEnd(30)} ${l.record.padEnd(6)} ${l.champion ? '★' : ' '}`)
  if (levels.length !== 30) console.warn(`  expected 30 levels, built ${levels.length}`)
  return { ...tier, levels }
})

writeFileSync(join(here, '..', 'src', 'data', 'campaigns.json'), JSON.stringify(campaigns) + '\n')
writeFileSync(join(here, '..', 'src', 'data', 'opponents.json'), JSON.stringify(campaigns[0].levels, null, 2) + '\n')
console.log(`\nwrote ${campaigns.length} campaigns -> src/data/campaigns.json (first tier also -> opponents.json)`)
