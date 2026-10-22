/**
 * Builds src/data/starters.json: every team-season on the wheel, its cards ranked by GAMES STARTED
 * that season — so a team can be loaded as the five who actually started for it (the 1995-96
 * Bulls with Ron Harper and Dennis Rodman), not as whichever five the ratings like best.
 *
 *   npm run starters            (run after `npm run teams` — it reads teamseasons.json)
 *
 * SOURCE: data/bref/Player Totals.csv, the per-stint rows (`gs`, `mp`), the same Basketball-
 * Reference dataset every other generator reads. A man traded mid-season is ranked by the starts he
 * made for THIS club, which is also the only club whose wheel entry carries his card (recal_69).
 *
 * THE RANK: games started, then total minutes, then the name — deterministic. Basketball-Reference
 * did not keep starts before 1981-82, so a team-season with any `gs` missing (1980 and 1981, nearly
 * all of them) is ranked by MINUTES instead, and is listed under `mp` so a reader can say so.
 *
 * WHAT IS STORED is small on purpose — not the names again (teamseasons.json already ships them),
 * but each team-season's `p` list as a rank: one base-36 character per card, the index into `p`,
 * best first. "1996 CHI": "2341065" reads p[2], p[3], p[4], p[1], p[0], ... — Jordan, Harper,
 * Pippen, Longley, Rodman, then the bench. The whole order is kept, not just the five, because the
 * custom matchup sits out a man already on the other side and the next starter by starts steps in.
 *
 * `gaps` names the real top-five starters who have NO CARD on that team-season (outside the pool,
 * or carded for the club he played more games for). Their place goes to the next card by starts —
 * the honest five the pool can field — and the list says who is missing.
 *
 * `hash` fingerprints teamseasons.json's keys and rosters. The index strings mean nothing against a
 * different roster list, so tests/starters.test.ts recomputes it and fails if `npm run teams` has
 * run since this did.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rosterHash, startersKey } from '../src/engine/starters'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

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
const num = (s: string) => (s === '' || s === 'NA' ? null : Number(s))

interface TS {
  y: number
  ab: string
  p: string[]
}
const WHEEL = JSON.parse(readFileSync(join(root, 'src', 'data', 'teamseasons.json'), 'utf8')) as TS[]
const CARDS = JSON.parse(readFileSync(join(root, 'src', 'data', 'players_stats.json'), 'utf8')) as { name: string; player: string }[]
const bareOf = new Map(CARDS.map((c) => [c.name, c.player]))

/** season|team -> that club's stint rows: bare name, starts (null = not kept), minutes */
interface Row {
  player: string
  gs: number | null
  mp: number
}
const rows = new Map<string, Row[]>()
for (const r of parseCsv(readFileSync(join(root, 'data', 'bref', 'Player Totals.csv'), 'utf8'))) {
  if (r.lg !== 'NBA') continue
  const k = `${r.season} ${r.team}`
  if (!rows.has(k)) rows.set(k, [])
  rows.get(k)!.push({ player: r.player, gs: num(r.gs), mp: num(r.mp) ?? 0 })
}

const order: Record<string, string> = {}
const mp: string[] = []
const gaps: Record<string, string[]> = {}
const unmatched: string[] = []
for (const t of WHEEL) {
  const key = startersKey(t.y, t.ab)
  const club = rows.get(key) ?? []
  const byMinutes = !club.length || club.some((r) => r.gs === null)
  if (byMinutes) mp.push(key)
  const score = (r: Row | undefined) => (r ? (byMinutes ? r.mp : r.gs!) : -1)
  const rank = (a: Row, b: Row) => score(b) - score(a) || b.mp - a.mp || a.player.localeCompare(b.player)
  const rowOf = (card: string) => club.find((r) => norm(r.player) === norm(bareOf.get(card) ?? card))
  const idx = t.p.map((n, i) => ({ i, n, r: rowOf(n) }))
  for (const c of idx) if (!c.r) unmatched.push(`${key}: ${c.n}`)
  idx.sort((a, b) => (a.r && b.r ? rank(a.r, b.r) : a.r ? -1 : b.r ? 1 : a.n.localeCompare(b.n)))
  order[key] = idx.map((c) => c.i.toString(36)).join('')
  // who really started, carded or not
  const carded = new Set(t.p.map((n) => norm(bareOf.get(n) ?? n)))
  const missing = [...club].sort(rank).slice(0, 5).filter((r) => !carded.has(norm(r.player))).map((r) => r.player)
  if (missing.length) gaps[key] = missing
}

const out = { hash: rosterHash(WHEEL), mp, gaps, order }
writeFileSync(join(root, 'src', 'data', 'starters.json'), JSON.stringify(out))
const size = Buffer.byteLength(JSON.stringify(out))
console.log(`wrote ${Object.keys(order).length} team-seasons (${(size / 1024).toFixed(1)} KB) · ranked by minutes (no starts kept): ${mp.length} · with a real starter who has no card: ${Object.keys(gaps).length}`)
if (unmatched.length) console.log(`cards with no Player Totals row (ranked last): ${unmatched.length}\n  ${unmatched.slice(0, 20).join('\n  ')}`)
const bulls = WHEEL.find((t) => t.y === 1996 && t.ab === 'CHI')!
console.log('1996 CHI by starts:', [...order['1996 CHI']].map((c) => bulls.p[parseInt(c, 36)]).join(' · '))
