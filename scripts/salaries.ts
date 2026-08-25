/**
 * Salary per player-season for the Salary Cap campaign, with the league cap
 * that year and the share of it.
 *
 * Sources, both public:
 *   1985–2018  salaries_1985to2018.csv (Basketball-Reference-keyed `player_id`,
 *              so the join is exact: pool name+season → B-Ref id via the
 *              Per Game rows → salary)
 *   2019–2026  ESPN salary tables, joined by name + season
 * The cap table is the league's published salary cap by season.
 *
 *   npm run salaries
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SCRATCH = join(process.env.LOCALAPPDATA ?? '', 'Temp/claude/C--Users-tomer-Desktop/213b1108-7de9-4ece-b091-d21781a1f07f/scratchpad')
const REPO_BREF = join(here, '..', 'data', 'bref')   // the CSVs live in the repo now
const BREF = existsSync(REPO_BREF) ? REPO_BREF : join(SCRATCH, 'bref')
const SAL = join(SCRATCH, 'salaries')

for (const f of [join(BREF, 'Player Per Game.csv'), join(SAL, 's85.csv')]) {
  if (!existsSync(f)) {
    console.error(`missing ${f}`)
    process.exit(1)
  }
}

/** League salary cap by season (season = the year it ends), USD. */
const CAP: Record<number, number> = {
  1985: 3_600_000, 1986: 4_233_000, 1987: 4_945_000, 1988: 6_164_000, 1989: 7_232_000,
  1990: 9_802_000, 1991: 11_871_000, 1992: 12_500_000, 1993: 14_000_000, 1994: 15_175_000,
  1995: 15_964_000, 1996: 23_000_000, 1997: 24_363_000, 1998: 26_900_000, 1999: 30_000_000,
  2000: 34_000_000, 2001: 35_500_000, 2002: 42_500_000, 2003: 40_271_000, 2004: 43_840_000,
  2005: 43_870_000, 2006: 49_500_000, 2007: 53_135_000, 2008: 55_630_000, 2009: 58_680_000,
  2010: 57_700_000, 2011: 58_044_000, 2012: 58_044_000, 2013: 58_044_000, 2014: 58_679_000,
  2015: 63_065_000, 2016: 70_000_000, 2017: 94_143_000, 2018: 99_093_000, 2019: 101_869_000,
  2020: 109_140_000, 2021: 109_140_000, 2022: 112_414_000, 2023: 123_655_000, 2024: 136_021_000,
  2025: 140_588_000, 2026: 154_647_000,
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
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/gi, '').toLowerCase().trim()

// pool name+season -> B-Ref player_id
const pid = new Map<string, string>()
for (const r of parseCsv(readFileSync(join(BREF, 'Player Per Game.csv'), 'utf8'))) {
  const k = `${norm(r.player)}|${r.season}`
  if (!pid.has(k)) pid.set(k, r.player_id)
}

// 1985-2018 by (player_id, season_end); a traded season lists each team — keep the max
const byPid = new Map<string, number>()
for (const r of parseCsv(readFileSync(join(SAL, 's85.csv'), 'utf8'))) {
  if (r.league !== 'NBA') continue
  const k = `${r.player_id}|${r.season_end}`
  const v = Number(r.salary)
  if (!Number.isFinite(v)) continue
  byPid.set(k, Math.max(byPid.get(k) ?? 0, v))
}

// 2019+ by (norm name, season)
const byName = new Map<string, number>()
const espnPath = join(SAL, 'espn.json')
if (existsSync(espnPath)) {
  for (const e of JSON.parse(readFileSync(espnPath, 'utf8')) as { name: string; season: number; salary: number }[]) {
    byName.set(`${norm(e.name)}|${e.season}`, e.salary)
  }
} else console.warn('no espn.json — 2019+ seasons will have no salary')

interface P {
  name: string
  player: string
  peak_season: number
}
const players = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'players_stats.json'), 'utf8')) as P[]

const out: Record<string, { sal: number; cap: number; pct: number }> = {}
let hit = 0
const missByDecade = new Map<number, number>()
for (const p of players) {
  const y = p.peak_season
  const cap = CAP[y]
  if (!cap) continue
  const id = pid.get(`${norm(p.player)}|${y}`)
  let sal = id ? byPid.get(`${id}|${y}`) : undefined
  if (sal === undefined) sal = byName.get(`${norm(p.player)}|${y}`)
  if (sal === undefined) {
    const d = Math.floor(y / 10) * 10
    missByDecade.set(d, (missByDecade.get(d) ?? 0) + 1)
    continue
  }
  hit++
  out[p.name] = { sal, cap, pct: Math.round((1000 * sal) / cap) / 10 }
}

writeFileSync(join(here, '..', 'src', 'data', 'salaries.json'), JSON.stringify(out))
console.log(`salaries: ${hit} of ${players.length} (${((100 * hit) / players.length).toFixed(1)}%) -> src/data/salaries.json`)
console.log('missing by decade:', [...missByDecade].sort().map(([d, n]) => `${d}s:${n}`).join('  '))
for (const n of ["Michael Jordan '97", "Stephen Curry '16", "LeBron James '24", "Kyle Korver '15"]) console.log(`  ${n.padEnd(20)} ${JSON.stringify(out[n])}`)
