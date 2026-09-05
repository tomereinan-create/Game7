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
 * A team-season's five (tiers 1 and 2) is THE FIVE THE TEAM DB SHOWS: bestfive.ts's
 * startingFive() over the whole roster, the legal PG-to-C board that maximizes total
 * OVR — see THE LADDER FIELDS THE TEAM DB'S FIVE below. An all-time or custom five
 * (tiers 3 and 4) is the best LEGAL five over a member set, one card per man, by
 * whichever number that five is about — the same law, with a pluggable score.
 *
 * src/data/opponents.json keeps the first tier for the tests.
 *
 *   npm run opponents
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startingFive } from '../src/engine/bestfive'
import { seasonGauges, fieldGauges } from '../src/engine/gauges'
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
 * THE LADDER FIELDS THE TEAM DB'S FIVE (recal_142). ORCHESTRATOR'S DEFAULT, on his
 * "Dont ask me about campaigns order, do whatever you want there".
 *
 * A tier-1 or tier-2 level is a real team-season, and until this round its five was its five
 * HIGHEST-MINUTE men that could cover PG-to-C. The Team DB — the screen he browses those same
 * team-seasons on, and the screen the Versus and Custom pickers rank from — shows something else:
 * bestfive.ts's startingFive(), the legal board that maximizes total OVR over the whole roster.
 * Two different fives under one team name is one too many, so the ladder now fields the Team DB's.
 *
 * What the minutes rule was doing, measured before the swap: 54 of the 90 tier-1/2 levels fielded a
 * different five from the one the Team DB shows for the same team-season. The Heat '06 opened the
 * Champions tier WITHOUT Shaquille O'Neal (Payton/Wade/Posey/Walker/Haslem, dial 44/49 = 47, against
 * 76/64 = 70 with him); the Bulls '98 benched Scottie Pippen for Luc Longley's minutes; Chris Paul
 * '18, Kyrie Irving '16, Kristaps Porzingis '24 and '25, Draymond Green '22 and Tiago Splitter '14
 * all lost their place to a healthier role man. A season's minutes are an availability record, not a
 * statement about who the team is, and the ladder was reading them as the latter.
 *
 * NO MINUTES FLOOR, for the same reason: the Team DB applies none — it feeds every rostered card
 * into startingFive and shows "—" when the pool cannot cover a slot — and consistency with the Team
 * DB is the whole point of the round. gp x mpg no longer appears in this file.
 *
 * THE SEVEN ROSTERS THE STRICT BOARD CANNOT FILL keep the fit ladder this file has always had, now
 * with OVR as the objective instead of minutes: strict positions first, then one step over, then
 * anywhere. Six of last season's thirty and the Warriors '18 have a slot no rostered card is listed
 * at (no centre on the '18 Warriors or the '26 Warriors, no point guard on the '26 Timberwolves),
 * and the Team DB is allowed to print "—" for them where a ladder of thirty teams is not.
 */
function lineup(names: string[]): { five: P[]; fit: 'strict' | 'loose' | 'any' } | null {
  const roster = names.map((n) => byName.get(n)).filter((p): p is P => !!p)
  // strict = the Team DB's own call, not a re-implementation of it
  const sf = startingFive(roster).five.filter((p): p is P => !!p)
  if (sf.length === 5) return { five: sf, fit: 'strict' }
  for (const [fit, canPlay] of [['loose', loose], ['any', any]] as const) {
    const got = ovrBoard(roster, canPlay)
    if (got) return { five: got, fit }
  }
  return null
}
/**
 * startingFive()'s law with the eligibility test made a parameter — the same max-total-OVR
 * backtrack over one man per slot, and the same post-recal_74 tie-break ("If 2 players can play
 * pg/sg, the one with more ast gets the pg position") among arrangements of the chosen five.
 */
function ovrBoard(roster: P[], canPlay: (n: string) => P5[]): P[] | null {
  const slots: (P | null)[] = POS.map(() => null)
  const used = new Set<string>()
  let best: (P | null)[] = POS.map(() => null)
  let bestSum = -1
  const walk = (i: number, sum: number) => {
    if (i === 5) {
      if (sum > bestSum) {
        bestSum = sum
        best = [...slots]
      }
      return
    }
    for (const c of roster) {
      if (used.has(c.name) || !canPlay(c.name).includes(POS[i])) continue
      used.add(c.name)
      slots[i] = c
      walk(i + 1, sum + c.ovr)
      used.delete(c.name)
      slots[i] = null
    }
    walk(i + 1, sum) // a roster hole still counts as a board
  }
  walk(0, 0)
  const chosen = best.filter((p): p is P => !!p)
  if (chosen.length !== 5) return null
  const apg = (p: P | null) => (p ? (stats[p.name]?.apg ?? 0) : -1)
  const board: (P | null)[] = POS.map(() => null)
  let out: (P | null)[] = best
  let bestKey = -Infinity
  const place = (idx: number) => {
    if (idx === chosen.length) {
      if (apg(board[0]) > bestKey) {
        bestKey = apg(board[0])
        out = [...board]
      }
      return
    }
    const can = canPlay(chosen[idx].name)
    for (let s = 0; s < 5; s++) {
      if (board[s] || !can.includes(POS[s])) continue
      board[s] = chosen[idx]
      place(idx + 1)
      board[s] = null
    }
  }
  place(0)
  return out.filter((p): p is P => !!p)
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
/** The OFF/DEF pair the Team DB and the level map show — era-relative, gauges.ts. */
const dial = (five: P[], season?: number) => (season ? seasonGauges(five, season) : fieldGauges(five))
/**
 * THE TEAM DB'S OWN OVR (TeamDb.tsx ovrOf): the mean of the era-relative OFF and DEF dials,
 * read in the five's own season. The number the round-2 tier climbs by, see theChampions().
 */
const dialOvr = (five: P[], season?: number) => {
  const g = dial(five, season)
  return Math.round((g.off + g.def) / 2)
}

/**
 * HOW TIERS 3 AND 4 CLIMB (recal_113, his ruling "Lal prob the hardest"): the five's TOTAL OVR,
 * with the raw net as the tie-break.
 *
 * Every side in these two tiers is BUILT by maximising sum-OVR — allTime() calls pickFive(list, ovr)
 * for each franchise and theCustoms() calls it for each themed pool — so sum-OVR is the tier's own
 * construction principle, and ordering a tier by the quantity that assembled each of its levels is
 * the only key under which "this level is harder" and "this level has more of the franchise's best"
 * are the same sentence. It settles both of his ordering rulings without naming anyone: the all-time
 * Lakers field the tier's most talented five (455, the highest of the thirty) and therefore end
 * tier 3, and the All-Time First Team IS the five best cards in the pool by construction, so nothing
 * in tier 4 can out-total it and it ends the ladder without being pinned there.
 *
 * WHY NOT THE RAW NET, which ordered these tiers before: it is a FIT reading, not a talent reading.
 * The usage reconciliation sheds possessions from every alpha in a five of alphas, so the more
 * stacked a side is the more the net discounts it — the all-time Lakers (Magic, Kobe, LeBron, Davis,
 * O'Neal) came 29th of 30 behind a 76ers five carrying 22 fewer points of OVR. recal_110 fixed part
 * of that inside team_offense and recorded the rest; a LADDER should not wait on it.
 *
 * WHY NOT THE DIAL PAIR, which is what the Team DB shows: OFF and DEF are clamped at 99 and these
 * two tiers are exactly where constructed super-fives pile against that rail — nine of the thirty
 * all-time sides read OFF 99 and six of them tie on off+def, so the dial cannot order the top of the
 * climb at all. The tie-break below is the dial's own raw material (offRaw − drtgRef, the two
 * numbers gauges.ts scales), which is strictly ordered on both tiers, so where two franchises field
 * equal talent the five that actually plays better is the harder level.
 */
const sumOvr = (five: P[]) => five.reduce((a, p) => a + p.ovr, 0)
const ladderCmp = (a: P[], b: P[]) => sumOvr(a) - sumOvr(b) || netOf(a) - netOf(b)

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
  blurb: string
}
/**
 * NO HANDICAP — HIS RULING: "Remove the + that teams get further down the road. The teams are good
 * enough. No need for the boost." The ladder used to hand its opponents points of spread, 0/1/1/2 by
 * tier, and every tier above the first leaned on them. It carries none now: THE FIVES do the whole
 * climb, which is what they were rebuilt to do when tiers 2-4 stopped being ordinary teams from older
 * decades and became champions, franchise summits and the All-Time First Team.
 *
 * MEASURED WITHOUT IT (`npm run balance`, 40 drafts a level, on the pipeline-143 pool). Staffed
 * median, then first level to last — the spread's old reading in brackets:
 *
 *   The League   96.7%     99.9% -> 65.9%     (bare: 54.1% median)   unchanged, tier 1 never had any
 *   Champions    82.7%     95.5% -> 59.0%     (was 76.9%, 80.0% -> 52.4%)
 *   All-Time     53.9%     75.6% -> 35.7%     (was 43.1%, 71.2% -> 31.8%)
 *   Customs      63.2%     68.5% -> 17.9%     (was 46.9%, 75.6% ->  8.1%)
 *
 * Every seam still steps UP into the next tier (65.9 -> 95.5, 59.0 -> 75.6, 35.7 -> 68.5): a tier
 * opens softer than the one before it closed and climbs again, which is the shape a ladder wants and
 * the opposite of a cliff. The All-Time First Team still closes it, last, at 17.9% — several attempts,
 * not a wall. The model is deliberately pessimistic (no respins, no extra spins, naive assignments, no
 * tactics), so real play sits above these numbers.
 */
const TIERS: Tier[] = [
  { id: 'c2026', name: 'The League', years: [SEASON, SEASON], blurb: "Last season's league, worst record first." },
  { id: 'champs', name: 'The Champions', years: [1980, 2025], blurb: 'Every champion since 1980, and the elite that never won — weakest first.' },
  { id: 'alltime', name: 'All-Time', years: [1980, SEASON], blurb: 'The best five a franchise ever had, thirty of them, weakest first.' },
  { id: 'customs', name: 'The Customs', years: [1980, SEASON], blurb: 'Decades, awards, specialists — and the All-Time First Team, last.' },
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
  const lined = lineup(t.p)
  if (!lined) return null
  return { team: t.team, ab: t.ab, y: t.y, five: lined.five, w: s.w, l: s.l, srs: s.srs, champ: CHAMPS[t.y] === t.ab }
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
/**
 * Last season's thirty, WORST REAL RECORD FIRST. recal_142 leaves this key alone: tier 1's order
 * is the standings, not a reading off the engine at all, so it is not the raw `offRaw − drtgRef`
 * that tier 2 was ordered by and there is nothing to make consistent with the dial. Last season's
 * league is the one tier where the player already knows who is supposed to be bad.
 */
function theLeague(): Level[] {
  return wheel
    .filter((t) => t.y === SEASON)
    .map(build)
    .filter((b): b is Built => !!b && b.five.length === 5)
    .sort((a, b) => pct(a) - pct(b))
    .map((b) => ({ team: b.team, ab: b.ab, season: b.y, champion: b.champ, record: `${b.w}–${b.l}`, five: b.five }))
}

// ------------------------------------------------------------ tier 2 · THE CHAMPIONS
/**
 * Every champion 1980–2025, plus the elite that never won, WEAKEST TEAM-DB OVR FIRST.
 *
 * HOW THIS TIER CLIMBS (recal_142). ORCHESTRATOR'S DEFAULT, on his "Dont ask me about campaigns
 * order, do whatever you want there". The key is `dialOvr` — TeamDb.tsx's ovrOf, the mean of the
 * era-relative OFF and DEF dials from gauges.ts read in the five's own season — ascending, with the
 * raw net as the tie-break.
 *
 * WHY NOT THE RAW NET, which ordered this tier before. offRaw − drtgRef passes through no era table
 * at all, and on a tier that spans 1980 to 2025 that is most of the key: measured over the sixty
 * levels, Spearman(level, offRaw) = .965 and Spearman(level, −drtgRef) = .238 — the "difficulty"
 * climb was an offence climb with the defence along for the ride, so the Bulls '98 (DEF 94) sat at
 * level 2 and the Nuggets '23 at level 44. Against the seasons' own SRS the raw net ranks .345 and
 * the dial .451. The dial is also the only key on this tier the player can SEE: it is the number
 * printed on the team's row in the Team DB and on its ticket in the level map.
 *
 * The clamp objection that kept tiers 3 and 4 off the dial (recal_113: nine all-time sides read
 * OFF 99) does not bite here — no two of these sixty real team-seasons pile on the rail, 30 distinct
 * OVR values across 60 levels and the largest tie group is 6, all of them broken by the raw net.
 */
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
    .sort((a, b) => dialOvr(a.five, a.y) - dialOvr(b.five, b.y) || netOf(a.five) - netOf(b.five))
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
  return out.sort((a, b) => ladderCmp(a.five, b.five))
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

const decade = (from: number, to: number, pool: P[] = players) => pool.filter((p) => p.peak_season >= from && p.peak_season <= to)
/** Cards of men who satisfy a bare-name test. */
const men = (has: (player: string) => boolean, pool: P[] = players) => pool.filter((p) => has(p.player))
/**
 * A specialist five: the best five (by OVR — a specialist team is still a team)
 * among men who clear a floor on the attribute the team is named for. The floor
 * relaxes five points at a time until a legal PG-to-C five exists, so no set can
 * ever come up empty. ORCHESTRATOR'S DEFAULT: the floors are high (90, and 95 for
 * durability) so these read as specialist sides and not as "the best five in the
 * game with a filter" — at 85 they were drawing from most of the top of the pool.
 */
function specialists(key: string, floor: number, pool: P[] = players): P[] | null {
  for (let f = floor; f >= 0; f -= 5) {
    const five = pickFive(pool.filter((p) => Number((p.attrs as unknown as Record<string, unknown>)[key] ?? 0) >= f), (p) => p.ovr)
    if (five) return five
  }
  return null
}

interface Custom {
  name: string
  ab: string
  tag: string
  /**
   * recal_113: a side is no longer a fixed five — it is a RECIPE, evaluated against the men still
   * unclaimed when its turn comes. See THE DISTINCTNESS RULE in theCustoms().
   */
  build: (pool: P[]) => P[] | null
}
/** The same five men, however the set was described. recal_113 keeps it as the belt-and-braces
 *  check on the distinctness rule: with no man shared, no two fives can be equal either. */
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
  const school = (s: string, pool: P[]) => pickFive(men((n) => collegeOf.get(n) === s, pool), (p) => p.ovr)

  const first = pickFive(players, (p) => p.ovr)
  const firstMen = new Set((first ?? []).map((p) => p.player))
  const second = pickFive(players.filter((p) => !firstMen.has(p.player)), (p) => p.ovr)

  /**
   * The bench of candidate RECIPES, MOST WANTED FIRST — the order decides who gets first call on
   * the pool, not where a side lands on the ladder. See THE DISTINCTNESS RULE below.
   */
  const bench: Custom[] = [
    { name: 'All-1980s', ab: '80s', tag: 'the 1980s', build: (pool) => pickFive(decade(1980, 1989, pool), (p) => p.ovr) },
    { name: 'All-1990s', ab: '90s', tag: 'the 1990s', build: (pool) => pickFive(decade(1990, 1999, pool), (p) => p.ovr) },
    { name: 'All-2000s', ab: '00s', tag: 'the 2000s', build: (pool) => pickFive(decade(2000, 2009, pool), (p) => p.ovr) },
    { name: 'All-2010s', ab: '10s', tag: 'the 2010s', build: (pool) => pickFive(decade(2010, 2019, pool), (p) => p.ovr) },
    { name: 'All-2020s', ab: '20s', tag: 'the 2020s', build: (pool) => pickFive(decade(2020, SEASON, pool), (p) => p.ovr) },
    { name: 'East All-Stars', ab: 'EAST', tag: 'all-time', build: (pool) => pickFive(pool.filter((p) => east.has(p.name)), (p) => p.ovr) },
    { name: 'West All-Stars', ab: 'WEST', tag: 'all-time', build: (pool) => pickFive(pool.filter((p) => west.has(p.name)), (p) => p.ovr) },
    { name: 'All-International', ab: 'INTL', tag: 'all-time', build: (pool) => pickFive(men((n) => INTERNATIONAL.includes(n), pool), (p) => p.ovr) },
    { name: 'All-MVPs', ab: 'MVP', tag: 'all-time', build: (pool) => pickFive(men((n) => mvp.has(n), pool), (p) => p.ovr) },
    { name: 'All-DPOYs', ab: 'DPOY', tag: 'all-time', build: (pool) => pickFive(men((n) => dpoy.has(n), pool), (p) => p.ovr) },
    { name: 'All-Defense', ab: 'DEF', tag: 'all-time', build: (pool) => pickFive(pool, (p) => p.d_ovr) },
    { name: 'All-Offense', ab: 'OFF', tag: 'all-time', build: (pool) => pickFive(pool, (p) => p.o_ovr) },
    { name: 'All-Rookies', ab: 'ROOK', tag: 'rookie years', build: (pool) => pickFive(pool.filter((p) => firstSeason.get(p.player) === p.peak_season), (p) => p.ovr) },
    { name: 'All-Sophomores', ab: 'SOPH', tag: 'second years', build: (pool) => pickFive(pool.filter((p) => (firstSeason.get(p.player) ?? -9) + 1 === p.peak_season), (p) => p.ovr) },
    { name: 'All-Sixth-Men', ab: '6MOY', tag: 'all-time', build: (pool) => pickFive(men((n) => smoy.has(n), pool), (p) => p.ovr) },
    { name: 'All-Most-Improved', ab: 'MIP', tag: 'all-time', build: (pool) => pickFive(men((n) => mip.has(n), pool), (p) => p.ovr) },
    { name: 'All-Rookies-of-the-Year', ab: 'ROY', tag: 'all-time', build: (pool) => pickFive(men((n) => roy.has(n), pool), (p) => p.ovr) },
    { name: 'All-Hall-of-Fame', ab: 'HOF', tag: 'all-time', build: (pool) => pickFive(men((n) => hallOfFame.has(n), pool), (p) => p.ovr) },
    { name: 'All-NBA First Team', ab: 'ANBA', tag: 'all-time', build: (pool) => pickFive(men((n) => allNba1.has(n), pool), (p) => p.ovr) },
    { name: 'All-Defensive First Team', ab: 'ADEF', tag: 'all-time', build: (pool) => pickFive(men((n) => allDef1.has(n), pool), (p) => p.ovr) },
    { name: 'All-Shooters', ab: '3PT', tag: 'all-time', build: (pool) => specialists('3pt', 90, pool) },
    { name: 'All-Rim-Runners', ab: 'RIM', tag: 'all-time', build: (pool) => specialists('rim', 90, pool) },
    { name: 'All-Mid-Range', ab: 'MID', tag: 'all-time', build: (pool) => specialists('mid', 90, pool) },
    { name: 'All-Glass', ab: 'GLAS', tag: 'all-time', build: (pool) => specialists('drb', 90, pool) },
    { name: 'All-Playmakers', ab: 'PASS', tag: 'all-time', build: (pool) => specialists('playvol', 90, pool) },
    { name: 'All-Rim-Protection', ab: 'BLK', tag: 'all-time', build: (pool) => specialists('rimprot', 90, pool) },
    { name: 'All-Stoppers', ab: 'STOP', tag: 'all-time', build: (pool) => specialists('perdef', 90, pool) },
    { name: 'All-Iron', ab: 'IRON', tag: 'all-time', build: (pool) => specialists('durability', 95, pool) },
    { name: 'All-Efficiency', ab: 'EFF', tag: 'all-time', build: (pool) => specialists('efficiency', 90, pool) },
    { name: 'All-Kentucky', ab: 'UK', tag: 'all-time', build: (pool) => school('Kentucky', pool) },
    { name: 'All-Duke', ab: 'DUKE', tag: 'all-time', build: (pool) => school('Duke', pool) },
    { name: 'All-North-Carolina', ab: 'UNC', tag: 'all-time', build: (pool) => school('UNC', pool) },
    { name: 'All-UCLA', ab: 'UCLA', tag: 'all-time', build: (pool) => school('UCLA', pool) },
    { name: 'All-Kansas', ab: 'KU', tag: 'all-time', build: (pool) => school('Kansas', pool) },
  ]

  /**
   * THE DISTINCTNESS RULE (recal_113). Before this round 46 men filled the tier's 150 player slots
   * and 22 of the 30 sides shared three or more men with another side, because sig() deduped only
   * EXACT fives: every one of the five best cards in the game is an MVP, an All-NBA first teamer and
   * an All-Defensive first teamer, so "All-MVPs" and "All-NBA First Team" were four-fifths the same
   * side under two names.
   *
   * The rule chosen: A SIDE IS BUILT ONLY FROM MEN NO EARLIER SIDE HAS TAKEN. Every side on the
   * tier is therefore fully distinct — no two share a man at all, which is the strongest reading of
   * "mostly distinct" and the only one with nothing to tune. A recipe that cannot field a legal
   * PG-to-C five from what is left is dropped and the next name on the bench takes the slot, exactly
   * as before; the bench is longer than the tier for this reason.
   *
   * WHO GETS FIRST CALL: the two All-Time teams, because they are the ladder's ending and must be
   * the five and second-five best cards in the pool, not the best of what a themed side left behind.
   * Then the bench in its own order. The consequence is deliberate and worth naming: "All-MVPs" is
   * now the best MVP five among men not already on the ladder, so the themed sides read weaker than
   * they did and land earlier. That is what makes them separate levels rather than the same level
   * relabelled.
   */
  const claimedMen = new Set<string>()
  const claim = (five: P[]) => five.forEach((p) => claimedMen.add(p.player))
  if (first) claim(first)
  if (second) claim(second)

  const BODY = 28 // the tier is 30: this many climb by the ladder key, then the two All-Time teams
  const picked: { name: string; ab: string; tag: string; five: P[] }[] = []
  for (const c of bench) {
    const free = players.filter((p) => !claimedMen.has(p.player))
    const five = c.build(free)
    if (!five || five.length !== 5) {
      console.warn(`  ${c.name}: no legal five from the men still unclaimed, dropped`)
      continue
    }
    if (picked.some((q) => sig(q.five) === sig(five))) {
      console.warn(`  ${c.name}: the same five as a side already on the ladder — impossible under the distinctness rule`)
      continue
    }
    claim(five)
    picked.push({ name: c.name, ab: c.ab, tag: c.tag, five })
    if (picked.length === BODY) break
  }
  if (picked.length < BODY) console.warn(`  only ${picked.length} distinct custom sides; the bench needs more names`)

  const level = (c: { name: string; ab: string; tag: string; five: P[] }): Level => ({
    team: c.name, ab: c.ab, champion: false, tag: c.tag, five: c.five,
  })
  /**
   * THE ORDER (recal_113). This tier climbs by the RAW NET, not by the ladder key tier 3 uses, and
   * the difference is the tier's own question. Tier 3 asks which FRANCHISE is deepest — every side
   * there is the most talent one shirt can put on the floor, so talent orders it. Tier 4 asks how
   * hard a SHAPE is to beat: its sides are deliberately lopsided (All-Stoppers reads OFF 32, DEF 77)
   * and ordering them by talent would march the player past an easy 90-OVR side and into a hard 80.
   * Difficulty here is what he faces across the table, which is the net.
   *
   * Everything but the boss climbs, INCLUDING the All-Time Second Team — it used to be pinned at
   * level 29 whatever it read, which put a side weaker than eighteen of the levels before it second
   * from the end. It now lands where its strength puts it.
   *
   * The All-Time First Team is last and no longer needs the ceiling filter that used to bench any
   * side out-netting it: the distinctness rule below means a specialist side can no longer draw the
   * top cards, so nothing on the tier comes near the boss's net. The check stays as a warning.
   */
  const climbing = [...picked]
  if (second) climbing.push({ name: 'All-Time Second Team', ab: '2ND', tag: 'all-time', five: second })
  climbing.sort((a, b) => netOf(a.five) - netOf(b.five))
  const out = climbing.map(level)
  if (first) {
    const boss = netOf(first)
    const over = climbing.filter((c) => netOf(c.five) > boss)
    if (over.length) console.warn(`  ${over.length} sides out-net the All-Time First Team; the ending is no longer the hardest`)
    out.push(level({ name: 'All-Time First Team', ab: '1ST', tag: 'all-time', five: first }))
  }
  return out
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
  console.log(`\n${tier.name} · ${levels.length} levels · ${levels.filter((l) => l.champion).length} champions`)
  for (const l of levels) {
    // the dial printed here is the era-relative one the Team DB and the level map show
    const g = dial(l.players as P[], l.season)
    console.log(
      `  L${String(l.round).padStart(3)} ${l.team.padEnd(28)} ${(l.record ?? l.tag ?? '').padEnd(12)}` +
        ` net ${(g.offRaw - g.drtgRef).toFixed(2).padStart(7)}  OVR ${String(Math.round((g.off + g.def) / 2)).padStart(2)}` +
        ` OFF ${String(g.off).padStart(2)} DEF ${String(g.def).padStart(2)} ${l.champion ? '★' : ''}`,
    )
  }
  return { ...tier, levels }
})

const total = campaigns.reduce((a, c) => a + c.levels.length, 0)
writeFileSync(join(here, '..', 'src', 'data', 'campaigns.json'), JSON.stringify(campaigns) + '\n')
writeFileSync(join(here, '..', 'src', 'data', 'opponents.json'), JSON.stringify(campaigns[0].levels, null, 2) + '\n')
console.log(`\nwrote ${campaigns.length} tiers, ${total} levels -> src/data/campaigns.json (first tier also -> opponents.json)`)
console.log(`config.ts derives ROUNDS from this file, so the ladder is ${total} long.`)
