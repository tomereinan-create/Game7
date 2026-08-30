/**
 * Builds src/data/teamseasons.json for the Spin mode: every (year, conference,
 * team) since 1980 with the pool players who logged a stint there that season.
 * Sources: Player Per Game.csv per-stint rows (traded players appear on every
 * team they suited up for) + Team Summaries.csv full names. Display/draft data
 * only — the resolver never reads this.
 *
 *   npm run teams
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_BREF = join(here, '..', 'data', 'bref')   // the CSVs live in the repo now
const DEFAULT_DIR = existsSync(REPO_BREF)
  ? REPO_BREF
  : join(process.env.LOCALAPPDATA ?? '', 'Temp/claude/C--Users-tomer-Desktop/213b1108-7de9-4ece-b091-d21781a1f07f/scratchpad/bref')
const dir = process.argv[2] ?? DEFAULT_DIR
for (const f of ['Player Per Game.csv', 'Team Summaries.csv']) {
  if (!existsSync(join(dir, f))) {
    console.error(`missing ${f} in ${dir}`)
    process.exit(1)
  }
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
const isTot = (t: string) => t === 'TOT' || /^[2-9]TM$/.test(t)

/**
 * Conference by (abbrev, season), 1980+. Base membership plus the real
 * realignments: 1979-80 had CHI/MIL in the West and HOU/SAS in the East;
 * Miami's first season (1989) was in the Midwest.
 */
const EAST = new Set(['ATL','BOS','BRK','NJN','NYK','PHI','TOR','WAS','WSB','CHI','CLE','DET','IND','MIL','CHH','CHA','CHO','MIA','ORL'])
const WEST = new Set(['DAL','DEN','GSW','HOU','KCK','LAC','LAL','MEM','MIN','NOH','NOK','NOP','OKC','PHO','POR','SAC','SAS','SDC','SEA','UTA','VAN','NOJ'])
function conf(ab: string, season: number): 'E' | 'W' | null {
  if (season === 1980) {
    if (ab === 'CHI' || ab === 'MIL') return 'W'
    if (ab === 'HOU' || ab === 'SAS') return 'E'
  }
  if (season === 1989 && ab === 'MIA') return 'W'
  if (EAST.has(ab)) return 'E'
  if (WEST.has(ab)) return 'W'
  return null
}

/**
 * Division by franchise. The league ran four divisions (Atlantic / Central /
 * Midwest / Pacific) until the 2004 realignment, six after it; a franchise's
 * division is stable across the run apart from the relocations below, so this
 * table plus the two era rules covers every team-season we draft from.
 */
const DIV_MODERN: Record<string, string> = {
  BOS: 'Atlantic', BRK: 'Atlantic', NJN: 'Atlantic', NYK: 'Atlantic', PHI: 'Atlantic', TOR: 'Atlantic',
  CHI: 'Central', CLE: 'Central', DET: 'Central', IND: 'Central', MIL: 'Central',
  ATL: 'Southeast', CHA: 'Southeast', CHO: 'Southeast', CHH: 'Southeast', MIA: 'Southeast', ORL: 'Southeast', WAS: 'Southeast', WSB: 'Southeast',
  DEN: 'Northwest', MIN: 'Northwest', OKC: 'Northwest', SEA: 'Northwest', POR: 'Northwest', UTA: 'Northwest',
  GSW: 'Pacific', LAC: 'Pacific', SDC: 'Pacific', LAL: 'Pacific', PHO: 'Pacific', SAC: 'Pacific', KCK: 'Pacific',
  DAL: 'Southwest', HOU: 'Southwest', MEM: 'Southwest', VAN: 'Southwest', NOH: 'Southwest', NOK: 'Southwest', NOP: 'Southwest', NOJ: 'Southwest', SAS: 'Southwest',
}
const DIV_OLD: Record<string, string> = {
  BOS: 'Atlantic', NJN: 'Atlantic', NYK: 'Atlantic', PHI: 'Atlantic', WSB: 'Atlantic', WAS: 'Atlantic', MIA: 'Atlantic', ORL: 'Atlantic',
  ATL: 'Central', CHI: 'Central', CLE: 'Central', DET: 'Central', IND: 'Central', MIL: 'Central', CHH: 'Central', TOR: 'Central',
  DAL: 'Midwest', DEN: 'Midwest', HOU: 'Midwest', KCK: 'Midwest', SAS: 'Midwest', UTA: 'Midwest', MIN: 'Midwest', VAN: 'Midwest', MEM: 'Midwest', NOJ: 'Midwest',
  GSW: 'Pacific', LAC: 'Pacific', SDC: 'Pacific', LAL: 'Pacific', PHO: 'Pacific', POR: 'Pacific', SAC: 'Pacific', SEA: 'Pacific',
}
function division(ab: string, season: number): string | null {
  return (season >= 2005 ? DIV_MODERN[ab] : DIV_OLD[ab] ?? DIV_MODERN[ab]) ?? null
}

// team full names and records per (season, abbrev)
const teamName = new Map<string, string>()
const teamRec = new Map<string, string>()
for (const r of parseCsv(readFileSync(join(dir, 'Team Summaries.csv'), 'utf8'))) {
  if (r.lg !== 'NBA') continue
  teamName.set(`${r.season}|${r.abbreviation}`, r.team)
  const wn = Number(r.w)
  const l = Number(r.l)
  if (Number.isFinite(wn) && Number.isFinite(l)) teamRec.set(`${r.season}|${r.abbreviation}`, `${wn}–${l}`)
}

interface P {
  name: string
  player: string
  peak_season: number
}
const players = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'players_stats.json'), 'utf8')) as P[]
const stats = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'stats.json'), 'utf8')) as Record<
  string,
  { team?: string } | null
>

// pool index: norm(player)|season -> our unique names (rarely more than one)
const pool = new Map<string, string[]>()
for (const p of players) {
  const k = `${norm(p.player)}|${p.peak_season}`
  if (!pool.has(k)) pool.set(k, [])
  pool.get(k)!.push(p.name)
}

const rosters = new Map<string, Set<string>>() // season|abbrev -> names
const unmapped = new Map<string, number>()
// HIS RULING (recal_69 data law): a player who suited up for more than one team in a season
// qualifies ONLY for the team he played the most for. Stints are collected first; the team
// with the most games wins, total minutes (g x mp_per_game) breaks a games tie, and the
// abbreviation breaks a full tie so the output is deterministic.
const stints = new Map<string, { team: string; g: number; min: number }[]>() // name|season -> stints
for (const r of parseCsv(readFileSync(join(dir, 'Player Per Game.csv'), 'utf8'))) {
  if (r.lg !== 'NBA' || isTot(r.team)) continue
  const season = Number(r.season)
  if (season < 1980) continue
  const cands = pool.get(`${norm(r.player)}|${r.season}`)
  if (!cands?.length) continue
  // Same-name pairs: keep the candidate whose season team (from stats.json) fits.
  let name = cands[0]
  if (cands.length > 1) {
    const hit = cands.find((n) => {
      const t = stats[n]?.team
      return t === r.team || t === 'MULTI'
    })
    name = hit ?? cands[0]
  }
  if (conf(r.team, season) === null) {
    unmapped.set(`${r.team} ${season}`, (unmapped.get(`${r.team} ${season}`) ?? 0) + 1)
    continue
  }
  const g = Number(r.g) || 0
  const sk = `${season}|${name}`
  if (!stints.has(sk)) stints.set(sk, [])
  stints.get(sk)!.push({ team: r.team, g, min: g * (Number(r.mp_per_game) || 0) })
}
let movers = 0
let slotsRemoved = 0
for (const [sk, list] of stints) {
  const season = sk.slice(0, sk.indexOf('|'))
  const name = sk.slice(sk.indexOf('|') + 1)
  let best = list[0]
  for (const s of list) if (s.g > best.g || (s.g === best.g && (s.min > best.min || (s.min === best.min && s.team < best.team)))) best = s
  if (list.length > 1) {
    movers++
    slotsRemoved += list.length - 1
  }
  const k = `${season}|${best.team}`
  if (!rosters.has(k)) rosters.set(k, new Set())
  rosters.get(k)!.add(name)
}
console.log(`mid-season movers resolved to one team: ${movers} player-seasons, ${slotsRemoved} duplicate roster slots removed (most games wins; minutes, then abbrev, break ties)`)

if (unmapped.size) {
  console.log('UNMAPPED abbrevs (excluded):', [...unmapped.keys()].slice(0, 20).join(' · '))
}

interface TS {
  y: number
  c: 'E' | 'W'
  team: string
  ab: string
  div: string | null
  rec: string | null
  p: string[]
}
const out: TS[] = []
let thin = 0
for (const [k, names] of rosters) {
  const [seasonS, ab] = k.split('|')
  const y = Number(seasonS)
  if (names.size < 2) {
    thin++
    continue // a spin must offer a real choice
  }
  out.push({ y, c: conf(ab, y)!, team: teamName.get(k) ?? ab, ab, div: division(ab, y), rec: teamRec.get(k) ?? null, p: [...names].sort() })
}
out.sort((a, b) => a.y - b.y || a.ab.localeCompare(b.ab))

writeFileSync(join(here, '..', 'src', 'data', 'teamseasons.json'), JSON.stringify(out))
const perTeam = out.map((t) => t.p.length)
console.log(
  `wrote ${out.length} team-seasons (${thin} skipped for <2 qualified players) · roster size min ${Math.min(...perTeam)} avg ${(perTeam.reduce((a, b) => a + b, 0) / out.length).toFixed(1)} max ${Math.max(...perTeam)}`,
)
const bulls96 = out.find((t) => t.y === 1996 && t.ab === 'CHI')
console.log('1996 CHI:', JSON.stringify(bulls96))
