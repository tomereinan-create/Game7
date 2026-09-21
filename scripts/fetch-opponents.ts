/**
 * Fetches OPPONENT TOTALS — what every team allowed, season by season — from Basketball
 * Reference's own league pages, and writes them beside the rest of the dump as
 * `data/bref/Opponent Totals.csv`.
 *
 * HIS RULING, 2026-09-21: "have the stats be 4 lines - basic stats. League ranking. Opp basic
 * stats. League ranking." The first two rows come out of the dump this repo already holds; the
 * third does NOT, and cannot be derived from it. A player's season totals are his own, not his
 * opponents', so summing a roster gives what a team DID and never what was done to it. The four
 * factors in `Team Summaries.csv` carry opponent RATES (eFG%, TOV%, FT/FGA) and the boards can be
 * solved out of ORB%/DRB%, but the counts behind them cannot: three equations, four unknowns. An
 * estimate dressed as a box score is exactly what his ruling rules out — "real" — so the real ones
 * are fetched once, parsed to integers, and committed with the rest of the data.
 *
 * ONE PAGE PER SEASON, POLITELY, AND IT RESUMES. Basketball Reference allows twenty requests a
 * minute and answers 429 the moment you pass it — measured: at 1.4s between pages it cut us off
 * after thirty-four. The wait is 3.4s now (under eighteen a minute), a 429 backs off for a minute
 * and tries once more, the file is rewritten after every season, and any season already in the CSV
 * is skipped — so a run that is cut off is resumed by running it again.
 *
 *   npm run opponents-fetch          # then: npm run teamstats
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'data', 'bref')
if (!existsSync(out)) mkdirSync(out, { recursive: true })
const dest = join(out, 'Opponent Totals.csv')

const FROM = Number(process.argv[2] ?? 1980)
const TO = Number(process.argv[3] ?? 2026)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) game7-teamline/1.0'

/** The columns the team line needs, in the order they are written. */
const COLS = [
  'opp_fg', 'opp_fga', 'opp_fg3', 'opp_fg3a', 'opp_ft', 'opp_fta',
  'opp_orb', 'opp_drb', 'opp_trb', 'opp_ast', 'opp_stl', 'opp_blk', 'opp_tov', 'opp_pf', 'opp_pts',
] as const
const HEAD = ['season', 'team', 'g', ...COLS].join(',')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The secondary tables on a league page are sometimes inside an HTML comment; rows parse the same either way. */
function rowsOf(html: string, tableId: string): Record<string, string>[] {
  const at = html.indexOf(`id="${tableId}"`)
  if (at === -1) return []
  const end = html.indexOf('</table>', at)
  const chunk = html.slice(at, end === -1 ? at + 200000 : end)
  const rows: Record<string, string>[] = []
  for (const m of chunk.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells: Record<string, string> = {}
    for (const c of m[1].matchAll(/data-stat="([a-z_0-9]+)"[^>]*>(?:<a[^>]*>)?([^<]*)/g)) cells[c[1]] = c[2].trim()
    if (cells.team && cells.team !== 'Team' && !/League Average/i.test(cells.team)) rows.push(cells)
  }
  return rows
}

/** What is already on disk, season by season. */
const have = new Map<number, string[]>()
if (existsSync(dest)) {
  for (const l of readFileSync(dest, 'utf8').split(/\r?\n/)) {
    if (!l.trim() || l.startsWith('season,')) continue
    const y = Number(l.slice(0, l.indexOf(',')))
    if (!Number.isFinite(y)) continue
    if (!have.has(y)) have.set(y, [])
    have.get(y)!.push(l)
  }
  console.log(`resuming: ${have.size} seasons already on disk`)
}

/** Written after every season, so an interrupted run never loses the pages it paid for. */
const flush = () => {
  const years = [...have.keys()].sort((a, b) => a - b)
  writeFileSync(dest, [HEAD, ...years.flatMap((y) => have.get(y)!)].join('\n'), 'utf8')
}

const missing: number[] = []
let fails = 0

for (let y = FROM; y <= TO; y++) {
  if (have.has(y)) continue
  const url = `https://www.basketball-reference.com/leagues/NBA_${y}.html`
  let html = ''
  try {
    let res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.status === 429) {
      console.error(`${y}: 429 — waiting a minute`)
      await sleep(62000)
      res = await fetch(url, { headers: { 'User-Agent': UA } })
    }
    if (!res.ok) throw new Error(String(res.status))
    html = await res.text()
    fails = 0
  } catch (e) {
    console.error(`${y}: ${(e as Error).message}`)
    missing.push(y)
    if (++fails >= 3) {
      console.error('three in a row — stopping rather than hammering')
      break
    }
    await sleep(5000)
    continue
  }
  const rows = rowsOf(html, 'totals-opponent')
  if (rows.length) {
    have.set(
      y,
      rows.map((r) => {
        // the asterisk a playoff team's name carries on these tables is not part of its name
        const team = r.team.replace(/\*+$/, '')
        return [y, `"${team}"`, r.g, ...COLS.map((c) => r[c] ?? '')].join(',')
      }),
    )
    flush()
  } else {
    console.error(`${y}: no opponent totals table`)
    missing.push(y)
  }
  console.log(`${y}: ${rows.length} teams`)
  await sleep(3400)
}

flush()
const total = [...have.values()].reduce((a, v) => a + v.length, 0)
console.log(`${total} rows over ${have.size} seasons${missing.length ? `; no data for ${missing.join(', ')}` : ''}`)
