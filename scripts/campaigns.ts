/**
 * Builds src/data/campaigns.json: ONE ladder of four tiers, 150 levels, in the
 * order he ruled — "After you finish the 30 teams, you start going by champions
 * or other elite teams until these are finished. Then you start playing vs all
 * time "Team". Like the all time Celtics(Best 5 players on a celtics). You climb
 * the all time, Lal prob the hardest, and then you start playing againt costum
 * teams. All stars, all decade. etc"
 *
 *   1. THE LEAGUE    30 — last season's thirty, worst record first. Unchanged.
 *   2. THE CHAMPIONS 60 — every champion 1980-2025 plus the elite that never won.
 *   3. ALL-TIME      30 — one best-ever five per franchise, relocations merged.
 *   4. THE CUSTOMS   30 — decades, awards, specialists, and the All-Time First Team.
 *
 * A team-season's five (tiers 1 and 2) is its five highest-minute qualified
 * players that season that can cover PG · SG · SF · PF · C by their lifetime
 * Basketball-Reference positions — its actual rotation, numbers straight from
 * the pool, listed PG to C. An all-time or custom five (tiers 3 and 4) is the
 * best LEGAL five over a member set, one card per man, by whichever number that
 * five is about — the same law bestfive.ts plays by, with a pluggable score.
 *
 * src/data/opponents.json keeps the first tier for the tests.
 *
 *   npm run opponents
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eligible } from '../src/engine/positions'
import { ratings100 } from '../src/engine/offense'
import type { Player } from '../src/engine/types'

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
const bref = (f: string) => parseCsv(readFileSync(join(dir, f), 'utf8'))

interface P extends Player {
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
  { gp?: number; mpg?: number; apg?: number; pos?: string[] } | null
>
const wheel = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'teamseasons.json'), 'utf8')) as TS[]

// The most recent season the pool has.
const SEASON = Math.max(...wheel.map((t) => t.y))

/** (season, abbreviation) -> the team's summary row, every NBA season in the data. */
const summary = new Map<string, { w: number; l: number; srs: number }>()
const rk = (y: number, ab: string) => `${y}|${ab}`
for (const r of bref('Team Summaries.csv')) {
  if (r.lg !== 'NBA' || !r.abbreviation || r.abbreviation === 'NA') continue
  const w = Number(r.w)
  const l = Number(r.l)
  if (Number.isFinite(w) && Number.isFinite(l)) summary.set(rk(Number(r.season), r.abbreviation), { w, l, srs: Number(r.srs) })
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

/**
 * THE BEST LEGAL FIVE over a member set — bestfive.ts's law with the number it
 * maximizes made a parameter, because an all-time five is not always about OVR
 * (All-Defense is about DEF, All-Shooters about the three).
 *
 * ONE MAN, ONE CARD: a man's seasons are all in the pool, so first each man is
 * reduced to his single best card BY THAT SCORE — "a man appears once, at his
 * best card there". Then one card per slot, PG to C, maximizing the total. The
 * search only has to consider each slot's top five candidates: at most five
 * slots are filled, so if the optimum used a sixth-best man at a slot, one of
 * that slot's top five is free and swapping in cannot lose. That turns an
 * intractable sweep of ten thousand cards into 5^5 arrangements.
 *
 * The tie-break is bestfive.ts's, his ruling after recal_74 — "If 2 players can
 * play pg/sg, the one with more ast gets the pg position": among arrangements of
 * equal total, the one whose PG has the most assists wins.
 */
function pickFive(cards: P[], score: (p: P) => number): P[] | null {
  const best = new Map<string, P>()
  for (const c of cards) {
    const cur = best.get(c.player)
    if (!cur || score(c) > score(cur)) best.set(c.player, c)
  }
  const cands = [...best.values()]
  const perSlot = POS.map((s) =>
    cands.filter((c) => strict(c.name).includes(s)).sort((a, b) => score(b) - score(a)).slice(0, 5),
  )
  if (perSlot.some((s) => !s.length)) return null
  const apg = (p: P) => stats[p.name]?.apg ?? 0
  const slots = new Array<P>(5)
  const used = new Set<string>()
  let bestFive: P[] | null = null
  let bestKey: [number, number] = [-Infinity, -Infinity]
  const walk = (i: number, sum: number) => {
    if (i === 5) {
      const key: [number, number] = [sum, apg(slots[0])]
      if (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
        bestKey = key
        bestFive = [...slots]
      }
      return
    }
    for (const c of perSlot[i]) {
      if (used.has(c.player)) continue
      used.add(c.player)
      slots[i] = c
      walk(i + 1, sum + score(c))
      used.delete(c.player)
    }
  }
  walk(0, 0)
  return bestFive
}

/**
 * WHERE A FIVE SITS ON THE ALL-TIME DIAL: its net, offRaw − drtgRef, straight
 * from ratings100 — the same two numbers engine/gauges.ts scales into the OFF
 * and DEF the map shows. ORCHESTRATOR'S DEFAULT: the RAW net orders the tiers,
 * not the scaled OFF+DEF, because the dial clamps at 99 and the top of tier 2
 * and tier 4 is exactly where teams pile against that rail — raw net keeps the
 * climb strictly ordered all the way to the last level. Move this to the scaled
 * pair and the top ten of each tier goes to ties.
 */
const netOf = (five: P[]) => {
  const r = ratings100(five)
  return r.offRaw - r.drtgRef
}
const dial = (five: P[]) => ratings100(five)

/** NBA champions by season (the year the Finals were played), dataset abbreviations. */
const CHAMPS: Record<number, string> = {
  1980: 'LAL', 1981: 'BOS', 1982: 'LAL', 1983: 'PHI', 1984: 'BOS', 1985: 'LAL', 1986: 'BOS', 1987: 'LAL', 1988: 'LAL', 1989: 'DET',
  1990: 'DET', 1991: 'CHI', 1992: 'CHI', 1993: 'CHI', 1994: 'HOU', 1995: 'HOU', 1996: 'CHI', 1997: 'CHI', 1998: 'CHI', 1999: 'SAS',
  2000: 'LAL', 2001: 'LAL', 2002: 'LAL', 2003: 'SAS', 2004: 'DET', 2005: 'SAS', 2006: 'MIA', 2007: 'SAS', 2008: 'BOS', 2009: 'LAL',
  2010: 'LAL', 2011: 'DAL', 2012: 'MIA', 2013: 'MIA', 2014: 'SAS', 2015: 'GSW', 2016: 'CLE', 2017: 'GSW', 2018: 'GSW', 2019: 'TOR',
  2020: 'LAL', 2021: 'MIL', 2022: 'GSW', 2023: 'DEN', 2024: 'BOS', 2025: 'OKC',
}

/**
 * ELITE ENOUGH TO JOIN THE CHAMPIONS. ORCHESTRATOR'S DEFAULT, and the one number
 * in this file most likely to be moved: SRS ≥ 8.0, or 65 wins in an 82-game
 * season. His rule as handed down was "SRS ≥ 8.0 (or ≥ 60 wins)" for "~60
 * levels" — but sixty wins lets in 47 teams and makes the tier 93 levels long,
 * half again as long as the ladder can carry. Sixty-five keeps the clause and
 * its spirit (a win total so high it speaks for itself, the '07 Mavericks) and
 * lands the tier on exactly 60: 46 champions and 14 that never won.
 */
const ELITE_SRS = 8.0
const ELITE_WINS = 65

interface Tier {
  id: string
  name: string
  years: [number, number]
  /** Points of spread the opponent gets, the tier's difficulty. */
  handicap: number
  blurb: string
}
/**
 * HANDICAPS — 0 · 1 · 1 · 2, MEASURED, not guessed (`npm run balance`, which was written for this
 * and reports the series odds a competent draft holds at every level of the ladder).
 *
 * Tier 1 keeps its zero: last season's league is the game as it has always been, and a bare draft
 * still wins about 59% of those series. Above it the old law was "the handicap does the climbing",
 * because the old tiers 2-4 were ordinary teams from older decades and needed the points to stay
 * ahead of the pool. That is no longer true: these tiers are champions, franchise summits and the
 * All-Time First Team, so THE FIVES do the climbing and the spread only leans on it. The first
 * draft of this file rose 0/2/3/4 in the old spirit and measured out at a median of 8% for the
 * whole Customs tier and 5% on the last level — a wall, not a climb. At 0/1/1/2 the same model
 * reads (median, then first level to last, for a player with the Front-office branch bought, which
 * everyone reaching tier 3 has):
 *
 *   The League   96%      100% -> 65%     (bare, with nothing bought: 59% median)
 *   Champions    71%       74% -> 47%
 *   All-Time     41%       65% -> 25%
 *   Customs      17%       30% -> 12%     the All-Time First Team, last, at 12%
 *
 * — one long ramp with no cliff at a tier seam and a final boss that takes several attempts. The
 * model is deliberately pessimistic (no respins, no extra spins, naive assignments, no tactics),
 * so real play sits above these numbers. Move a value and re-run the script before shipping it.
 */
const TIERS: Tier[] = [
  { id: 'c2026', name: 'The League', years: [SEASON, SEASON], handicap: 0, blurb: "Last season's league, worst record first." },
  { id: 'champs', name: 'The Champions', years: [1980, 2025], handicap: 1, blurb: 'Every champion since 1980, and the elite that never won — weakest first.' },
  { id: 'alltime', name: 'All-Time', years: [1980, SEASON], handicap: 1, blurb: 'The best five a franchise ever had, thirty of them, weakest first.' },
  { id: 'customs', name: 'The Customs', years: [1980, SEASON], handicap: 2, blurb: 'Decades, awards, specialists — and the All-Time First Team, last.' },
]

/**
 * THE FRANCHISE LINEAGE: forty abbreviations in the data, thirty franchises
 * today, per the NBA's own franchise histories. The Charlotte line is the one
 * that catches people out — the Hornets' 1988-2002 record went back to Charlotte
 * with the name in 2014, so CHH (Charlotte Hornets), CHA (Bobcats) and CHO
 * (Hornets again) are ONE franchise, and New Orleans' history starts in 2002:
 * NOH · NOK · NOP are the Pelicans.
 */
const FRANCHISE: Record<string, string> = {
  NJN: 'BRK',        // New Jersey Nets -> Brooklyn
  CHH: 'CHO', CHA: 'CHO', // Charlotte Hornets · Bobcats · Hornets — one lineage
  NOH: 'NOP', NOK: 'NOP', // New Orleans (/Oklahoma City) Hornets -> Pelicans
  KCK: 'SAC',        // Kansas City Kings -> Sacramento
  SDC: 'LAC',        // San Diego Clippers -> Los Angeles
  VAN: 'MEM',        // Vancouver Grizzlies -> Memphis
  SEA: 'OKC',        // Seattle SuperSonics -> Oklahoma City
  WSB: 'WAS',        // Washington Bullets -> Wizards
}
const franchiseOf = (ab: string) => FRANCHISE[ab] ?? ab
/** The nickname the all-time five is named for — "All-time Celtics", his words. */
const NICKNAME: Record<string, string> = {
  ATL: 'Hawks', BOS: 'Celtics', BRK: 'Nets', CHI: 'Bulls', CHO: 'Hornets', CLE: 'Cavaliers', DAL: 'Mavericks',
  DEN: 'Nuggets', DET: 'Pistons', GSW: 'Warriors', HOU: 'Rockets', IND: 'Pacers', LAC: 'Clippers', LAL: 'Lakers',
  MEM: 'Grizzlies', MIA: 'Heat', MIL: 'Bucks', MIN: 'Timberwolves', NOP: 'Pelicans', NYK: 'Knicks', OKC: 'Thunder',
  ORL: 'Magic', PHI: '76ers', PHO: 'Suns', POR: 'Trail Blazers', SAC: 'Kings', SAS: 'Spurs', TOR: 'Raptors',
  UTA: 'Jazz', WAS: 'Wizards',
}

interface Built {
  team: string
  ab: string
  y: number
  five: P[]
  w: number
  l: number
  srs: number
  champ: boolean
}
function build(t: TS): Built | null {
  const s = summary.get(rk(t.y, t.ab))
  if (!s) return null
  const ranked = [...t.p].filter((n) => byName.has(n)).sort((a, b) => minutes(b) - minutes(a))
  const lined = lineup(ranked)
  if (!lined) return null
  return { team: t.team, ab: t.ab, y: t.y, five: lined.names.map((n) => byName.get(n)!), w: s.w, l: s.l, srs: s.srs, champ: CHAMPS[t.y] === t.ab }
}
const pct = (b: Built) => b.w / (b.w + b.l)

/** One rung of the ladder, before it is numbered. */
interface Level {
  team: string
  ab: string
  season?: number
  champion: boolean
  record?: string
  /** Where a record would go for a five that never played a season: "all-time", "the 1990s". */
  tag?: string
  five: P[]
}

// ---------------------------------------------------------------- tier 1 · THE LEAGUE
/** Last season's thirty, worst record first. Untouched by the new ladder. */
function theLeague(): Level[] {
  return wheel
    .filter((t) => t.y === SEASON)
    .map(build)
    .filter((b): b is Built => !!b && b.five.length === 5)
    .sort((a, b) => pct(a) - pct(b))
    .map((b) => ({ team: b.team, ab: b.ab, season: b.y, champion: b.champ, record: `${b.w}–${b.l}`, five: b.five }))
}

// ------------------------------------------------------------ tier 2 · THE CHAMPIONS
/** Every champion 1980–2025, plus the elite that never won, weakest net first. */
function theChampions(): Level[] {
  const built = wheel
    .filter((t) => t.y >= 1980 && t.y <= 2025)
    .map(build)
    .filter((b): b is Built => !!b && b.five.length === 5)
  const seen = new Set<string>()
  const picked: Built[] = []
  for (const b of built) {
    const elite = b.srs >= ELITE_SRS || (b.w + b.l === 82 && b.w >= ELITE_WINS)
    if (!b.champ && !elite) continue
    const k = rk(b.y, b.ab)
    if (seen.has(k)) continue
    seen.add(k)
    picked.push(b)
  }
  return picked
    .sort((a, b) => netOf(a.five) - netOf(b.five))
    .map((b) => ({
      team: `${b.team} '${String(b.y).slice(2)}`,
      ab: b.ab,
      season: b.y,
      champion: b.champ,
      record: `${b.w}–${b.l}`,
      five: b.five,
    }))
}

// --------------------------------------------------------------- tier 3 · ALL-TIME
/** One five per franchise: his best card while he wore that shirt, relocations merged. */
function allTime(): Level[] {
  const cards = new Map<string, P[]>()
  for (const t of wheel) {
    const f = franchiseOf(t.ab)
    const list = cards.get(f) ?? []
    for (const n of t.p) {
      const c = byName.get(n)
      if (c) list.push(c)
    }
    cards.set(f, list)
  }
  const out: Level[] = []
  for (const [ab, list] of cards) {
    const five = pickFive(list, (p) => p.ovr)
    if (!five) {
      console.warn(`  ${ab}: no legal all-time five`)
      continue
    }
    out.push({ team: `All-time ${NICKNAME[ab] ?? ab}`, ab, champion: false, tag: 'all-time', five })
  }
  return out.sort((a, b) => netOf(a.five) - netOf(b.five))
}

// ------------------------------------------------------------- tier 4 · THE CUSTOMS
const awards = bref('Player Award Shares.csv')
const eosTeams = bref('End of Season Teams.csv')
const career = bref('Player Career Info.csv')
/** Winners of an award, by bare player name. */
const winnersOf = (award: string) =>
  new Set(awards.filter((r) => r.award === award && r.winner.toUpperCase() === 'TRUE').map((r) => r.player))
/** Everyone ever named to an end-of-season team of this type and number. */
const namedTo = (type: string, number_tm?: string) =>
  new Set(eosTeams.filter((r) => r.lg === 'NBA' && r.type === type && (!number_tm || r.number_tm === number_tm)).map((r) => r.player))
/** First NBA season on record, by bare player name — a rookie card is a card from that year. */
const firstSeason = new Map(career.map((r) => [r.player, Number(r.from)]))
const hallOfFame = new Set(career.filter((r) => r.hof.toUpperCase() === 'TRUE').map((r) => r.player))

/**
 * BORN OUTSIDE THE UNITED STATES — A HAND LIST, because there is no birthplace
 * in the data. Player Career Info carries a birth DATE and colleges, nothing
 * more, so the only honest options were a hand list or no All-International at
 * all. This is the obvious-names list; a man not on it is simply not considered,
 * which is a real limit and is reported rather than hidden. Add names here.
 */
const INTERNATIONAL = [
  'Nikola Jokic', 'Giannis Antetokounmpo', 'Luka Doncic', 'Joel Embiid', 'Dirk Nowitzki', 'Hakeem Olajuwon',
  'Tim Duncan', 'Steve Nash', 'Pau Gasol', 'Marc Gasol', 'Manu Ginobili', 'Tony Parker', 'Yao Ming',
  'Kristaps Porzingis', 'Victor Wembanyama', 'Shai Gilgeous-Alexander', 'Jamal Murray', 'Andrew Wiggins',
  'Rudy Gobert', 'Nikola Vucevic', 'Domantas Sabonis', 'Arvydas Sabonis', 'Drazen Petrovic', 'Vlade Divac',
  'Toni Kukoc', 'Peja Stojakovic', 'Detlef Schrempf', 'Andrei Kirilenko', 'Al Horford', 'Serge Ibaka',
  'Ben Simmons', 'Patty Mills', 'Bismack Biyombo', 'Jonas Valanciunas', 'Kelly Olynyk', 'Bogdan Bogdanovic',
  'Goran Dragic', 'Boris Diaw', 'Nene', 'Anderson Varejao', 'Leandro Barbosa', 'Zydrunas Ilgauskas',
  'Mehmet Okur', 'Hedo Turkoglu', 'Andrea Bargnani', 'Luol Deng', 'Thabo Sefolosha', 'Alex Len',
  'Franz Wagner', 'Lauri Markkanen', 'Deni Avdija', 'Josh Giddey', 'Dennis Schroder', 'Clint Capela',
  'Steven Adams', 'Jusuf Nurkic', 'Ricky Rubio', 'Jose Calderon', 'Beno Udrih', 'Marcin Gortat',
  'Tiago Splitter', 'Nicolas Batum', 'Evan Fournier', 'Rui Hachimura', 'Yuta Watanabe', 'Alperen Sengun',
  'Santi Aldama', 'Nikola Jovic', 'Karl-Anthony Towns', 'Kyrie Irving', 'Tim Hardaway', 'Bol Bol',
]

/** College on record, by bare player name; "NA" for the men who never went. */
const collegeOf = new Map(career.map((r) => [r.player, r.colleges]))

const decade = (from: number, to: number) => players.filter((p) => p.peak_season >= from && p.peak_season <= to)
/** Cards of men who satisfy a bare-name test. */
const men = (has: (player: string) => boolean) => players.filter((p) => has(p.player))
/**
 * A specialist five: the best five (by OVR — a specialist team is still a team)
 * among men who clear a floor on the attribute the team is named for. The floor
 * relaxes five points at a time until a legal PG-to-C five exists, so no set can
 * ever come up empty. ORCHESTRATOR'S DEFAULT: the floors are high (90, and 95 for
 * durability) so these read as specialist sides and not as "the best five in the
 * game with a filter" — at 85 they were drawing from most of the top of the pool.
 */
function specialists(key: string, floor: number): P[] | null {
  for (let f = floor; f >= 0; f -= 5) {
    const five = pickFive(players.filter((p) => Number((p.attrs as unknown as Record<string, unknown>)[key] ?? 0) >= f), (p) => p.ovr)
    if (five) return five
  }
  return null
}

interface Custom {
  name: string
  ab: string
  tag: string
  five: P[] | null
}
/** The same five men, however the set was described. */
const sig = (five: P[]) => five.map((p) => p.name).sort().join('|')

function theCustoms(): Level[] {
  const east = new Set<string>()
  const west = new Set<string>()
  for (const t of wheel) for (const n of t.p) (t.c === 'E' ? east : west).add(n)
  const mvp = winnersOf('nba mvp')
  const dpoy = winnersOf('nba dpoy')
  const smoy = winnersOf('nba smoy')
  const mip = winnersOf('nba mip')
  const roy = winnersOf('nba roy')
  const allNba1 = namedTo('All-NBA', '1st')
  const allDef1 = namedTo('All-Defense', '1st')
  const school = (s: string) => pickFive(men((n) => collegeOf.get(n) === s), (p) => p.ovr)

  const first = pickFive(players, (p) => p.ovr)
  const firstMen = new Set((first ?? []).map((p) => p.player))
  const second = pickFive(players.filter((p) => !firstMen.has(p.player)), (p) => p.ovr)

  /**
   * The bench of candidate sides, MOST WANTED FIRST — the order is the tie-break,
   * not the ladder. Many of these member sets contain the same handful of men
   * (every one of the five best cards in the game is an MVP, an All-NBA first
   * teamer AND an All-Defensive first teamer), so a set that lands on a five
   * already claimed is dropped and the next one down the bench takes the slot.
   * The first 28 survivors make the tier; the two All-Time teams are the ending.
   */
  const bench: Custom[] = [
    { name: 'All-1980s', ab: '80s', tag: 'the 1980s', five: pickFive(decade(1980, 1989), (p) => p.ovr) },
    { name: 'All-1990s', ab: '90s', tag: 'the 1990s', five: pickFive(decade(1990, 1999), (p) => p.ovr) },
    { name: 'All-2000s', ab: '00s', tag: 'the 2000s', five: pickFive(decade(2000, 2009), (p) => p.ovr) },
    { name: 'All-2010s', ab: '10s', tag: 'the 2010s', five: pickFive(decade(2010, 2019), (p) => p.ovr) },
    { name: 'All-2020s', ab: '20s', tag: 'the 2020s', five: pickFive(decade(2020, SEASON), (p) => p.ovr) },
    { name: 'East All-Stars', ab: 'EAST', tag: 'all-time', five: pickFive(players.filter((p) => east.has(p.name)), (p) => p.ovr) },
    { name: 'West All-Stars', ab: 'WEST', tag: 'all-time', five: pickFive(players.filter((p) => west.has(p.name)), (p) => p.ovr) },
    { name: 'All-International', ab: 'INTL', tag: 'all-time', five: pickFive(men((n) => INTERNATIONAL.includes(n)), (p) => p.ovr) },
    { name: 'All-MVPs', ab: 'MVP', tag: 'all-time', five: pickFive(men((n) => mvp.has(n)), (p) => p.ovr) },
    { name: 'All-DPOYs', ab: 'DPOY', tag: 'all-time', five: pickFive(men((n) => dpoy.has(n)), (p) => p.ovr) },
    { name: 'All-Defense', ab: 'DEF', tag: 'all-time', five: pickFive(players, (p) => p.d_ovr) },
    { name: 'All-Offense', ab: 'OFF', tag: 'all-time', five: pickFive(players, (p) => p.o_ovr) },
    { name: 'All-Rookies', ab: 'ROOK', tag: 'rookie years', five: pickFive(players.filter((p) => firstSeason.get(p.player) === p.peak_season), (p) => p.ovr) },
    { name: 'All-Sophomores', ab: 'SOPH', tag: 'second years', five: pickFive(players.filter((p) => (firstSeason.get(p.player) ?? -9) + 1 === p.peak_season), (p) => p.ovr) },
    { name: 'All-Sixth-Men', ab: '6MOY', tag: 'all-time', five: pickFive(men((n) => smoy.has(n)), (p) => p.ovr) },
    { name: 'All-Most-Improved', ab: 'MIP', tag: 'all-time', five: pickFive(men((n) => mip.has(n)), (p) => p.ovr) },
    { name: 'All-Rookies-of-the-Year', ab: 'ROY', tag: 'all-time', five: pickFive(men((n) => roy.has(n)), (p) => p.ovr) },
    { name: 'All-Hall-of-Fame', ab: 'HOF', tag: 'all-time', five: pickFive(men((n) => hallOfFame.has(n)), (p) => p.ovr) },
    { name: 'All-NBA First Team', ab: 'ANBA', tag: 'all-time', five: pickFive(men((n) => allNba1.has(n)), (p) => p.ovr) },
    { name: 'All-Defensive First Team', ab: 'ADEF', tag: 'all-time', five: pickFive(men((n) => allDef1.has(n)), (p) => p.ovr) },
    { name: 'All-Shooters', ab: '3PT', tag: 'all-time', five: specialists('3pt', 90) },
    { name: 'All-Rim-Runners', ab: 'RIM', tag: 'all-time', five: specialists('rim', 90) },
    { name: 'All-Mid-Range', ab: 'MID', tag: 'all-time', five: specialists('mid', 90) },
    { name: 'All-Glass', ab: 'GLAS', tag: 'all-time', five: specialists('drb', 90) },
    { name: 'All-Playmakers', ab: 'PASS', tag: 'all-time', five: specialists('playvol', 90) },
    { name: 'All-Rim-Protection', ab: 'BLK', tag: 'all-time', five: specialists('rimprot', 90) },
    { name: 'All-Stoppers', ab: 'STOP', tag: 'all-time', five: specialists('perdef', 90) },
    { name: 'All-Iron', ab: 'IRON', tag: 'all-time', five: specialists('durability', 95) },
    { name: 'All-Efficiency', ab: 'EFF', tag: 'all-time', five: specialists('efficiency', 90) },
    { name: 'All-Kentucky', ab: 'UK', tag: 'all-time', five: school('Kentucky') },
    { name: 'All-Duke', ab: 'DUKE', tag: 'all-time', five: school('Duke') },
    { name: 'All-North-Carolina', ab: 'UNC', tag: 'all-time', five: school('UNC') },
    { name: 'All-UCLA', ab: 'UCLA', tag: 'all-time', five: school('UCLA') },
    { name: 'All-Kansas', ab: 'KU', tag: 'all-time', five: school('Kansas') },
  ]

  const BODY = 28 // the tier is 30: this many climb by net, then the two All-Time teams
  /**
   * NOTHING ON THE LADDER OUT-TOPS THE SUMMIT. The All-Time First Team is the five best CARDS,
   * and the best five cards are five alphas who share one ball — so a couple of specialist sides
   * (All-Efficiency, All-Stoppers) actually read a few points of net ABOVE it, which would leave
   * the last level of the game not the hardest. A side that out-nets the boss is put back on the
   * bench and the next name takes its place; the bench is deep enough to absorb it.
   */
  const ceiling = first ? netOf(first) : Infinity
  const claimed = new Set<string>()
  if (first) claimed.add(sig(first))
  if (second) claimed.add(sig(second))
  const picked: Custom[] = []
  for (const c of bench) {
    if (!c.five || c.five.length !== 5) {
      console.warn(`  ${c.name}: no legal five, dropped`)
      continue
    }
    const s = sig(c.five)
    if (claimed.has(s)) {
      console.warn(`  ${c.name}: the same five as a side already on the ladder, dropped`)
      continue
    }
    if (netOf(c.five) > ceiling) {
      console.warn(`  ${c.name}: net ${netOf(c.five).toFixed(2)} tops the All-Time First Team, dropped`)
      continue
    }
    claimed.add(s)
    picked.push(c)
    if (picked.length === BODY) break
  }
  if (picked.length < BODY) console.warn(`  only ${picked.length} distinct custom sides; the bench needs more names`)

  const level = (c: Custom): Level => ({ team: c.name, ab: c.ab, champion: false, tag: c.tag, five: c.five! })
  const body = picked.sort((a, b) => netOf(a.five!) - netOf(b.five!)).map(level)
  // THE ENDING, fixed whatever the net says: the All-Time Second Team, then the All-Time First
  // Team — the five best cards in the pool, legal by position — as the last level of the game.
  const ending: Level[] = []
  if (second) ending.push(level({ name: 'All-Time Second Team', ab: '2ND', tag: 'all-time', five: second }))
  if (first) ending.push(level({ name: 'All-Time First Team', ab: '1ST', tag: 'all-time', five: first }))
  return [...body, ...ending]
}

// ------------------------------------------------------------------------- the ladder
const BUILDERS: Record<string, () => Level[]> = { c2026: theLeague, champs: theChampions, alltime: allTime, customs: theCustoms }

const campaigns = TIERS.map((tier) => {
  const built = BUILDERS[tier.id]()
  const levels = built.map((b, i) => ({
    round: i + 1,
    team: b.team,
    ab: b.ab,
    ...(b.season === undefined ? {} : { season: b.season }),
    champion: b.champion,
    ...(b.record === undefined ? {} : { record: b.record }),
    ...(b.tag === undefined ? {} : { tag: b.tag }),
    positions: [...POS],
    players: b.five,
  }))
  console.log(`\n${tier.name} · ${levels.length} levels · ${levels.filter((l) => l.champion).length} champions · opponents +${tier.handicap}`)
  for (const l of levels) {
    const g = dial(l.players as P[])
    console.log(
      `  L${String(l.round).padStart(3)} ${l.team.padEnd(28)} ${(l.record ?? l.tag ?? '').padEnd(12)}` +
        ` net ${(g.offRaw - g.drtgRef).toFixed(2).padStart(7)}  OFF ${String(g.off).padStart(2)} DEF ${String(g.def).padStart(2)} ${l.champion ? '★' : ''}`,
    )
  }
  return { ...tier, levels }
})

const total = campaigns.reduce((a, c) => a + c.levels.length, 0)
writeFileSync(join(here, '..', 'src', 'data', 'campaigns.json'), JSON.stringify(campaigns) + '\n')
writeFileSync(join(here, '..', 'src', 'data', 'opponents.json'), JSON.stringify(campaigns[0].levels, null, 2) + '\n')
console.log(`\nwrote ${campaigns.length} tiers, ${total} levels -> src/data/campaigns.json (first tier also -> opponents.json)`)
console.log(`config.ts derives ROUNDS from this file, so the ladder is ${total} long.`)
