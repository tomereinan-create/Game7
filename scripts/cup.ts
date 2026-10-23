/**
 * THE ALL-TIME CUP (since 1980) — the Game 7 plan's §6.6, frozen in one run.
 *
 *   npx vite-node scripts/cup.ts            writes data/cup/all-time-cup-2026.{json,md,csv}
 *   npx vite-node scripts/cup.ts --check    re-runs every series and fails if the frozen file disagrees
 *
 * TEAMS: the thirty All-Time franchise fives exactly as the campaign plays them (ladder L91–L120,
 * src/data/campaigns.json), unchanged — so a viewer can face any of them in the game.
 * GROUPS AND NIGHTS: the real 2026 Emirates NBA Cup draw and group-stage schedule (NBA.com,
 * "Emirates NBA Cup 2026 groups announced"; ESPN's 2026 NBA Cup schedule): every group game is played
 * on the night the real clubs meet, with the real home club as side A.
 * A GAME: one seeded best-of-seven — `simSeries(compile(A, B), compile(B, A), makeRng(seed), SIGMA)`,
 * the batch engine's and Settle It's call, so `?creator=1&a=L113&b=L120&seed=…` films the same series.
 * SEEDS, fixed before anything was run, so nothing can be re-rolled: BASE + game number, games 1–60
 * in schedule order (date, then the order listed), quarterfinals 61–64, semifinals 65–66, final 67.
 * STANDINGS: series won, then game differential, then head-to-head among the tied clubs (their series
 * won against each other, then game differential in those series), then point differential, then
 * points scored, then a drawing seeded from BASE.
 * KNOCKOUTS: the three group winners and the best runner-up (wildcard) of each conference; winners
 * seeded 1–3 by series won, game differential, point differential, points scored, drawing; the
 * wildcard is 4. QF 1v4 and 2v3, the higher seed as side A; SF the conference's two QF winners; final
 * East v West, the side with the better group record as A.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIGMA } from '../src/config'
import { LADDER } from '../src/engine/batch'
import { boxScore, compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import { tapeSeed } from '../src/engine/ticker'
import type { Opponent, SeriesResult } from '../src/engine/types'

const BASE = 20261024
const root = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(root, 'data', 'cup')

type Conf = 'East' | 'West'
const GROUPS: { id: string; conf: Conf; clubs: string[] }[] = [
  { id: 'East A', conf: 'East', clubs: ['DET', 'TOR', 'ORL', 'MIL', 'BRK'] },
  { id: 'East B', conf: 'East', clubs: ['NYK', 'CLE', 'PHI', 'MIA', 'IND'] },
  { id: 'East C', conf: 'East', clubs: ['BOS', 'ATL', 'CHO', 'CHI', 'WAS'] },
  { id: 'West A', conf: 'West', clubs: ['DEN', 'HOU', 'PHO', 'DAL', 'UTA'] },
  { id: 'West B', conf: 'West', clubs: ['OKC', 'MIN', 'LAC', 'NOP', 'MEM'] },
  { id: 'West C', conf: 'West', clubs: ['SAS', 'LAL', 'POR', 'GSW', 'SAC'] },
]

/** The real group stage, "away @ home", in the order the schedule lists each night. */
const NIGHTS: [string, string][] = [
  ['2026-10-30', 'CHO@WAS CHI@BOS DET@BRK NYK@PHI ORL@TOR IND@MIA HOU@DAL LAC@MIN LAL@GSW DEN@PHO'],
  ['2026-11-06', 'WAS@ATL BOS@CHO PHI@CLE UTA@DAL OKC@MEM TOR@MIL MIN@NOP POR@LAL SAS@SAC'],
  ['2026-11-13', 'NYK@IND MIL@ORL CLE@MIA ATL@CHI MEM@NOP UTA@HOU GSW@SAS POR@SAC OKC@LAC'],
  ['2026-11-20', 'CHO@ATL ORL@BRK IND@CLE TOR@DET WAS@CHI NOP@OKC PHO@UTA HOU@DEN SAC@LAL'],
  ['2026-11-24', 'DET@ORL BOS@WAS DAL@DEN'],
  ['2026-11-25', 'MIA@PHI CHI@CHO CLE@NYK MIN@OKC LAC@MEM BRK@MIL PHO@HOU SAC@GSW SAS@POR'],
  ['2026-11-27', 'MIA@NYK MIL@DET PHI@IND BRK@TOR ATL@BOS MEM@MIN DAL@PHO LAL@SAS DEN@UTA NOP@LAC GSW@POR'],
].map(([d, g]) => [d, g] as [string, string])

const KO_DATES = { QF_East: '2026-12-04', QF_West: '2026-12-05', SF: '2026-12-08/09', Final: '2026-12-11' }

// ---- the clubs: the All-Time tier of the ladder, by club code ----
const allTime = LADDER.filter((o) => o.tag === 'all-time' && /^All-time /.test(o.team))
const CLUB = new Map<string, Opponent>(allTime.map((o) => [o.ab!, o]))
if (CLUB.size !== 30) throw new Error(`expected 30 All-Time fives, found ${CLUB.size}`)
const groupOf = new Map<string, (typeof GROUPS)[number]>()
for (const g of GROUPS) for (const c of g.clubs) {
  if (!CLUB.has(c)) throw new Error(`no All-Time five for ${c}`)
  groupOf.set(c, g)
}

// ---- the schedule is a full round robin: every pair in a group exactly once ----
const schedule = NIGHTS.flatMap(([date, list]) => list.split(' ').map((s) => { const [away, home] = s.split('@'); return { date, home, away } }))
{
  const seen = new Set<string>()
  for (const g of schedule) {
    const gh = groupOf.get(g.home)
    const ga = groupOf.get(g.away)
    if (!gh || gh !== ga) throw new Error(`${g.away}@${g.home} is not a group game`)
    const key = [g.home, g.away].sort().join('-')
    if (seen.has(key)) throw new Error(`${key} twice`)
    seen.add(key)
  }
  if (schedule.length !== 60 || seen.size !== 60) throw new Error(`schedule has ${schedule.length} games / ${seen.size} pairs, want 60`)
}

// ---- one game ----
const label = (ab: string) => `L${CLUB.get(ab)!.round}`
function play(a: string, b: string, seed: number): SeriesResult {
  const A = CLUB.get(a)!.players
  const B = CLUB.get(b)!.players
  return simSeries(compile(A, B), compile(B, A), makeRng(seed), SIGMA)
}
/** The scores the Series screen shows: games 1-6 off the resolver, a seventh game off its tape (ticker.ts). */
const shown = (r: SeriesResult, seed: number) =>
  r.games.map((g, i) => {
    if (i !== 6) return { us: g.us, them: g.them }
    const t = boxScore(g.margin, makeRng(tapeSeed(seed, 6)))
    return g.margin > 0 ? { us: t.win, them: t.lose } : { us: t.lose, them: t.win }
  })
const line = (r: SeriesResult, seed: number) => shown(r, seed).map((g) => `${g.us}-${g.them}`).join(' ')

interface Game {
  no: number
  date: string
  group: string
  a: string
  b: string
  seed: number
  winner: string
  series: string
  games: string
  pointsA: number
  pointsB: number
  creator: string
}
const creatorUrl = (a: string, b: string, seed: number) => `https://game7draft.com/?creator=1&a=${label(a)}&b=${label(b)}&seed=${seed}`
function game(no: number, date: string, group: string, a: string, b: string): Game {
  const seed = BASE + no
  const r = play(a, b, seed)
  return {
    no,
    date,
    group,
    a,
    b,
    seed,
    winner: r.won ? a : b,
    series: `${r.wins}-${r.losses}`,
    games: line(r, seed),
    pointsA: shown(r, seed).reduce((s, g) => s + g.us, 0),
    pointsB: shown(r, seed).reduce((s, g) => s + g.them, 0),
    creator: creatorUrl(a, b, seed),
  }
}

const groupGames = schedule.map((s, i) => game(i + 1, s.date, groupOf.get(s.home)!.id, s.home, s.away))

// ---- standings ----
interface Row {
  club: string
  team: string
  w: number
  l: number
  gw: number
  gl: number
  pf: number
  pa: number
}
const drawing = (() => {
  const r = makeRng(BASE)
  const order = [...CLUB.keys()].sort()
  const draw = new Map<string, number>()
  for (const c of order) draw.set(c, r.next())
  return draw
})()
const tableOf = (clubs: string[], games: Game[]): Map<string, Row> => {
  const t = new Map<string, Row>(clubs.map((c) => [c, { club: c, team: CLUB.get(c)!.team, w: 0, l: 0, gw: 0, gl: 0, pf: 0, pa: 0 }]))
  for (const g of games) {
    if (!t.has(g.a) || !t.has(g.b)) continue
    const [wa, wb] = g.series.split('-').map(Number)
    const A = t.get(g.a)!
    const B = t.get(g.b)!
    if (g.winner === g.a) (A.w++, B.l++)
    else (B.w++, A.l++)
    A.gw += wa
    A.gl += wb
    B.gw += wb
    B.gl += wa
    A.pf += g.pointsA
    A.pa += g.pointsB
    B.pf += g.pointsB
    B.pa += g.pointsA
  }
  return t
}
const after = (keys: ((r: Row) => number)[]) => (x: Row, y: Row) => {
  for (const k of keys) if (k(x) !== k(y)) return k(y) - k(x)
  return 0
}
const tail = after([(r) => r.pf - r.pa, (r) => r.pf, (r) => -drawing.get(r.club)!])
/** Order a set of clubs: series won, game differential, head-to-head among the tied, then the tail. */
function rank(clubs: string[], games: Game[]): Row[] {
  const t = tableOf(clubs, games)
  const rows = [...t.values()].sort(after([(r) => r.w, (r) => r.gw - r.gl]))
  const out: Row[] = []
  for (let i = 0; i < rows.length; ) {
    let j = i + 1
    while (j < rows.length && rows[j].w === rows[i].w && rows[j].gw - rows[j].gl === rows[i].gw - rows[i].gl) j++
    const tied = rows.slice(i, j)
    if (tied.length === 1) out.push(tied[0])
    else {
      // head-to-head: the mini-table of the tied clubs' series against each other
      const h2h = tableOf(tied.map((r) => r.club), games)
      const byH2h = [...tied].sort((x, y) => after([(r) => h2h.get(r.club)!.w, (r) => h2h.get(r.club)!.gw - h2h.get(r.club)!.gl])(x, y) || tail(x, y))
      out.push(...byH2h)
    }
    i = j
  }
  return out
}

const standings = GROUPS.map((g) => ({ group: g.id, conf: g.conf, rows: rank(g.clubs, groupGames.filter((x) => x.group === g.id)) }))

// ---- knockouts ----
const orderNoH2h = (rows: Row[]) => [...rows].sort(after([(r) => r.w, (r) => r.gw - r.gl, (r) => r.pf - r.pa, (r) => r.pf, (r) => -drawing.get(r.club)!]))
const field = (conf: Conf) => {
  const gs = standings.filter((s) => s.conf === conf)
  const winners = orderNoH2h(gs.map((s) => s.rows[0]))
  const wildcard = orderNoH2h(gs.map((s) => s.rows[1]))[0]
  return [...winners, wildcard].map((r, i) => ({ seed: i + 1, club: r.club, how: i < 3 ? `${groupOf.get(r.club)!.id} winner` : `wildcard (${groupOf.get(r.club)!.id} runner-up)` }))
}
const fieldE = field('East')
const fieldW = field('West')
const recordOf = new Map(standings.flatMap((s) => s.rows.map((r) => [r.club, r])))
const ko: (Game & { round: string; seedA: number; seedB: number })[] = []
const koGame = (no: number, round: string, date: string, x: { seed: number; club: string }, y: { seed: number; club: string }) => {
  const g = { ...game(no, date, round, x.club, y.club), round, seedA: x.seed, seedB: y.seed }
  ko.push(g)
  return { seed: g.winner === x.club ? x.seed : y.seed, club: g.winner }
}
const qfE1 = koGame(61, 'QF East', KO_DATES.QF_East, fieldE[0], fieldE[3])
const qfE2 = koGame(62, 'QF East', KO_DATES.QF_East, fieldE[1], fieldE[2])
const qfW1 = koGame(63, 'QF West', KO_DATES.QF_West, fieldW[0], fieldW[3])
const qfW2 = koGame(64, 'QF West', KO_DATES.QF_West, fieldW[1], fieldW[2])
const higher = (x: { seed: number; club: string }, y: { seed: number; club: string }) => (x.seed <= y.seed ? [x, y] : [y, x])
const sfE = koGame(65, 'SF East', KO_DATES.SF, ...(higher(qfE1, qfE2) as [typeof qfE1, typeof qfE2]))
const sfW = koGame(66, 'SF West', KO_DATES.SF, ...(higher(qfW1, qfW2) as [typeof qfW1, typeof qfW2]))
const better = orderNoH2h([recordOf.get(sfE.club)!, recordOf.get(sfW.club)!])
const fin = koGame(67, 'Final', KO_DATES.Final, { seed: 0, club: better[0].club }, { seed: 0, club: better[1].club })

// ---- the frozen record ----
const frozen = {
  name: 'The All-Time Cup (since 1980)',
  frozen: '2026-10-23',
  engine: { commit: process.env.CUP_COMMIT ?? 'unknown', sigma: SIGMA, call: 'simSeries(compile(A,B), compile(B,A), makeRng(seed), SIGMA)' },
  seeds: { base: BASE, rule: 'seed = base + game number; group games 1-60 in schedule order, QF 61-64, SF 65-66, final 67' },
  clubs: Object.fromEntries([...CLUB.entries()].map(([ab, o]) => [ab, { team: o.team, level: label(ab), five: o.players.map((p) => p.name) }])),
  groups: GROUPS,
  games: groupGames,
  standings: standings.map((s) => ({ group: s.group, conf: s.conf, rows: s.rows.map((r, i) => ({ pos: i + 1, ...r, gd: r.gw - r.gl, pd: r.pf - r.pa })) })),
  knockouts: { field: { East: fieldE, West: fieldW }, games: ko, champion: fin.club },
}

if (process.argv.includes('--check')) {
  const old = JSON.parse(readFileSync(join(OUT, 'all-time-cup-2026.json'), 'utf8'))
  const same = JSON.stringify({ ...old, engine: null, frozen: null }) === JSON.stringify({ ...frozen, engine: null, frozen: null })
  console.log(same ? 'cup: the frozen record replays exactly on this engine' : 'cup: MISMATCH — this engine no longer plays the frozen Cup')
  process.exit(same ? 0 : 1)
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'all-time-cup-2026.json'), JSON.stringify(frozen, null, 2) + '\n')

const name = (ab: string) => CLUB.get(ab)!.team.replace('All-time ', '')
const md: string[] = []
md.push(`# The All-Time Cup (since 1980) — frozen ${frozen.frozen}`, '')
md.push(`Thirty All-Time franchise fives (ladder L91–L120, unchanged), the real 2026 NBA Cup groups and group nights, one seeded best-of-seven per game. Seeds: base ${BASE} + game number (fixed before the run; no re-rolls). Engine: main ${frozen.engine.commit}, sigma ${SIGMA}.`, '')
md.push('Film any series with its creator link (side A is the real home club). If the engine changes before an episode is filmed, film from this commit — `npx vite-node scripts/cup.ts --check` says whether the live engine still plays this Cup.', '')
md.push('## Standings', '')
for (const s of frozen.standings) {
  md.push(`### ${s.group}`, '', '| # | Club | Series W-L | Games W-L | GD | Pts diff |', '|---|---|---|---|---|---|')
  for (const r of s.rows) md.push(`| ${r.pos} | ${name(r.club)} | ${r.w}-${r.l} | ${r.gw}-${r.gl} | ${r.gd > 0 ? '+' : ''}${r.gd} | ${r.pd > 0 ? '+' : ''}${r.pd} |`)
  md.push('')
}
md.push('## Group games', '', '| # | Night | Group | Home (A) | Away (B) | Seed | Winner | Series | Games (A-B) |', '|---|---|---|---|---|---|---|---|---|')
for (const g of groupGames) md.push(`| ${g.no} | ${g.date} | ${g.group} | ${name(g.a)} | ${name(g.b)} | ${g.seed} | ${name(g.winner)} | ${g.series} | ${g.games} |`)
md.push('', '## Knockouts', '')
md.push(`East field: ${fieldE.map((f) => `${f.seed}. ${name(f.club)} (${f.how})`).join(' · ')}`, '')
md.push(`West field: ${fieldW.map((f) => `${f.seed}. ${name(f.club)} (${f.how})`).join(' · ')}`, '')
md.push('| # | Round | Date | A | B | Seed | Winner | Series | Games (A-B) |', '|---|---|---|---|---|---|---|---|---|')
for (const g of ko) md.push(`| ${g.no} | ${g.round} | ${g.date} | ${g.seedA ? `(${g.seedA}) ` : ''}${name(g.a)} | ${g.seedB ? `(${g.seedB}) ` : ''}${name(g.b)} | ${g.seed} | ${name(g.winner)} | ${g.series} | ${g.games} |`)
md.push('', `**Champion: ${CLUB.get(fin.club)!.team}**`, '', '## The fives', '')
for (const [ab, c] of Object.entries(frozen.clubs)) md.push(`- **${c.team}** (${c.level}, ${groupOf.get(ab)!.id}): ${c.five.join(', ')}`)
md.push('', '## Creator links', '')
for (const g of [...groupGames, ...ko]) md.push(`- #${g.no} ${name(g.a)} v ${name(g.b)}: ${g.creator}`)
writeFileSync(join(OUT, 'all-time-cup-2026.md'), md.join('\n') + '\n')

const csv = ['no,date,round,home_a,away_b,seed,winner,series,games,points_a,points_b,creator']
for (const g of [...groupGames.map((g) => ({ ...g, round: g.group })), ...ko]) csv.push([g.no, g.date, g.round, name(g.a), name(g.b), g.seed, name(g.winner), g.series, g.games, g.pointsA, g.pointsB, g.creator].join(','))
writeFileSync(join(OUT, 'all-time-cup-2026.csv'), csv.join('\n') + '\n')

console.log(`cup frozen: 60 group series, ${ko.length} knockout series, champion ${CLUB.get(fin.club)!.team}`)
for (const s of frozen.standings) console.log(`${s.group}: ${s.rows.map((r) => `${name(r.club)} ${r.w}-${r.l}`).join(', ')}`)
console.log(`East: ${fieldE.map((f) => `${f.seed}.${name(f.club)}`).join(' ')} · West: ${fieldW.map((f) => `${f.seed}.${name(f.club)}`).join(' ')}`)
for (const g of ko) console.log(`${g.round} ${name(g.a)} v ${name(g.b)} → ${name(g.winner)} ${g.series}`)
