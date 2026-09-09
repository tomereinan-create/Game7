/**
 * Real box-score lines for every player's PEAK season, from the same
 * Basketball-Reference dataset build_ratings.py reads (sumitrodatta/
 * bball-reference-datasets: Player Per Game + Advanced). Joins on player name
 * + peak_season; a traded season uses the TOT row. Display only.
 *
 *   npm run stats                       # cached CSVs in the scratchpad
 *   npm run stats -- path/to/Data       # a local copy of the dataset folder
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
for (const f of ['Player Per Game.csv', 'Advanced.csv']) {
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
const num = (s: string | undefined) => {
  if (s === undefined || s === '' || s === 'NA') return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}
const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10)
const pct = (v: number | null) => (v === null ? null : Math.round(v * 1000) / 10)
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/gi, '').toLowerCase().trim()

const perGame = parseCsv(readFileSync(join(dir, 'Player Per Game.csv'), 'utf8'))
const advanced = parseCsv(readFileSync(join(dir, 'Advanced.csv'), 'utf8'))

/** (normName|season) -> row, preferring the combined row when a player was traded. */
function index(rows: Record<string, string>[]) {
  const m = new Map<string, Record<string, string>>()
  const isTot = (t: string) => t === 'TOT' || /^[2-9]TM$/.test(t)
  for (const r of rows) {
    if (r.lg !== 'NBA' && r.lg !== 'BAA') continue
    const k = `${norm(r.player)}|${r.season}`
    const prev = m.get(k)
    if (!prev || isTot(r.team)) m.set(k, r)
    else if (!isTot(prev.team) && (num(r.g) ?? 0) > (num(prev.g) ?? 0)) m.set(k, r)
  }
  return m
}
const pg = index(perGame)
const adv = index(advanced)

/**
 * E17 (2026-09-10): WHICH CLUBS A TRADED MAN ACTUALLY PLAYED FOR.
 *
 * `index()` above keeps ONE row per (name|season) and prefers the combined TOT / 2TM / 3TM row,
 * which is right for every NUMBER on the card — the combined row is his whole season. But it holds
 * no club, so the emitted team field was the placeholder 'MULTI' and a traded man's card named no
 * team at all. His ruling: show every club instead.
 *
 * The split rows were never lost — they are still in the same CSV, and scripts/teams.ts already
 * reads them at this same stage for the recal_69 roster law. This walks them in SOURCE ROW ORDER,
 * which IS the chronology, so Gafford '24 comes out ['WAS', 'DAL'] rather than sorted or reversed.
 *
 * KEYED BY player_id, NOT BY NAME. Measured: keying by name reports 20 three-club cards where the
 * truth is 16, because two different men called Eddie Johnson (johnsed02 and johnsed03) pool into
 * one false chain in 1986. The CSV's own id is the only safe key.
 */
const stints = new Map<string, string[]>()
for (const r of perGame) {
  if (r.lg !== 'NBA' && r.lg !== 'BAA') continue
  if (r.team === 'TOT' || /^[2-9]TM$/.test(r.team)) continue
  const k = `${r.player_id}|${r.season}`
  const at = stints.get(k)
  if (at) at.push(r.team)
  else stints.set(k, [r.team])
}

/** Lifetime positions: the union of every position B-Ref ever listed for the player, any year. */
const ORDER = ['PG', 'SG', 'SF', 'PF', 'C']
const lifetimePos = new Map<string, Set<string>>()
for (const r of perGame) {
  if (!r.pos || r.pos === 'NA') continue
  const k = norm(r.player)
  if (!lifetimePos.has(k)) lifetimePos.set(k, new Set())
  for (const tok of r.pos.split('-')) if (ORDER.includes(tok)) lifetimePos.get(k)!.add(tok)
}

interface P {
  name: string
  player: string
  peak_season: number
}
const players = JSON.parse(readFileSync(join(here, '..', 'src', 'data', 'players_stats.json'), 'utf8')) as P[]

const out: Record<string, Record<string, number | string | string[]> | null> = {}
let hit = 0
const misses: string[] = []
for (const p of players) {
  const key = p.name
  const k = `${norm(p.player)}|${p.peak_season}`
  const g = pg.get(k)
  const a = adv.get(k)
  if (!g) {
    out[key] = null
    misses.push(`${p.player} ${p.peak_season}`)
    continue
  }
  hit++
  const posSet = lifetimePos.get(norm(p.player)) ?? new Set<string>()
  const line: Record<string, number | string | string[] | null> = {
    // one shape for everyone: a single-club man is a list of one, so nothing downstream branches
    teams:
      g.team === 'TOT' || /^[2-9]TM$/.test(g.team) ? (stints.get(`${g.player_id}|${g.season}`) ?? [g.team]) : [g.team],
    pos: ORDER.filter((x) => posSet.has(x)),
    gp: num(g.g) ?? 0,
    mpg: r1(num(g.mp_per_game)),
    ppg: r1(num(g.pts_per_game)),
    rpg: r1(num(g.trb_per_game)),
    apg: r1(num(g.ast_per_game)),
    spg: r1(num(g.stl_per_game)),
    bpg: r1(num(g.blk_per_game)),
    topg: r1(num(g.tov_per_game)),
    fgp: pct(num(g.fg_percent)),
    tpp: pct(num(g.x3p_percent)),
    ftp: pct(num(g.ft_percent)),
    ts: a ? pct(num(a.ts_percent)) : null,
    per: a ? r1(num(a.per)) : null,
    ws: a ? r1(num(a.ws)) : null,
    bpm: a ? r1(num(a.bpm)) : null,
    vorp: a ? r1(num(a.vorp)) : null,
    usg: a ? r1(num(a.usg_percent)) : null,
  }
  out[key] = Object.fromEntries(Object.entries(line).filter(([, v]) => v !== null)) as Record<string, number | string | string[]>
}
const dest = join(here, '..', 'src', 'data', 'stats.json')
writeFileSync(dest, JSON.stringify(out))
console.log(`stat lines: ${hit} of ${players.length} (${((100 * hit) / players.length).toFixed(1)}%) -> ${dest}`)
if (misses.length) console.log(`missing: ${misses.slice(0, 10).join(' · ')}`)
for (const n of ["Michael Jordan '88", "Stephen Curry '16", "David Robinson '94"]) console.log(`  ${n.padEnd(18)} ${JSON.stringify(out[n])}`)
