/**
 * BATCH SIM — one matchup, N seeded series, on the app's own engine (src/engine/batch.ts).
 *
 *   npm run batch-sim -- 1996-CHI 2017-GSW                      10,000 series, real starters, base seed 1
 *   npm run batch-sim -- 1996-CHI L12 --n 50000 --seed 7
 *   npm run batch-sim -- 1996-CHI 2017-GSW --starters best      the best legal five by OVR instead
 *   npm run batch-sim -- 1996-CHI 2017-GSW --json               machine output
 *   npm run batch-sim -- --file cup.json [--out cup.results.json]
 *
 * A SIDE is a team-season, YYYY-AB with YYYY the season's closing year (1996-CHI is the 72-10
 * Bulls), loaded as its real starting five (`--starters real`, the default — engine/starters.ts) or
 * its best five by OVR (`--starters best`, the custom matchup's other loader); or a ladder level, L1
 * to the top, played exactly as the campaign has it. Side B loads with side A's men sitting out,
 * which is the custom matchup's rule, so the same matchup can be built in the app.
 *
 * SEEDS: series i (0..n-1) is seeded base + i (engine/batch.ts seriesSeed). The seed printed beside
 * a close Game 7 is the number the app's simSeries takes — makeRng(seed) with the same two fives,
 * optimal on both sides as the custom matchup plays it, gives the same series, and the Game 7 final
 * printed is the one the Series screen shows (the tape's, not the resolver's box). `--assign naive`
 * plays A's board the way an untrained campaign coach does instead.
 *
 * FILE MODE: a JSON array of matchups, each { "a": "1996-CHI", "b": "2017-GSW" } with optional
 * "starters", "n", "seed" and "label"; a side may also be { "name": "...", "five": [card names] }.
 * Every matchup runs on the same base seed unless it names its own. Writes the results JSON (default:
 * the input's name with .results.json) and prints one line per matchup. The All-Time Cup's sixty
 * group series run this way.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { batchSim, resolveMatchup, seriesSeed, type BatchResult, type Side, type SideSpec } from '../src/engine/batch'
import type { Assignment } from '../src/engine/offense'
import type { FiveKind } from '../src/engine/starters'

const argv = process.argv.slice(2)
const flags = new Map<string, string>()
const pos: string[] = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) pos.push(a)
  else if (a === '--json' || a === '--allow-dupes') flags.set(a.slice(2), '1')
  else flags.set(a.slice(2), argv[++i] ?? '')
}
const num = (k: string, d: number) => {
  const v = flags.get(k)
  if (v === undefined) return d
  const n = Number(v)
  if (!Number.isFinite(n)) fail(`--${k} wants a number, got "${v}"`)
  return n
}
function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}
const kindOf = (s: string | undefined): FiveKind => {
  if (s === undefined || s === 'real' || s === 'best') return (s ?? 'real') as FiveKind
  return fail(`--starters is real or best, got "${s}"`)
}
const N = num('n', 10000)
const SEED = num('seed', 1)
const CLOSEST = num('closest', 10)
const KIND = kindOf(flags.get('starters'))
const assign = flags.get('assign') ?? 'optimal'
if (assign !== 'optimal' && assign !== 'naive') fail(`--assign is optimal or naive, got "${assign}"`)
const ASSIGN = assign as Assignment
const JSON_OUT = flags.has('json')
const DUPES = flags.has('allow-dupes')

interface Run {
  label: string
  a: Side
  b: Side
  starters: FiveKind
  assignment: Assignment
  result: BatchResult
}
function run(a: SideSpec, b: SideSpec, o: { kind: FiveKind; n: number; seed: number; label?: string; dupes?: boolean }): Run {
  const [A, B] = resolveMatchup(a, b, o.kind, o.dupes ?? DUPES)
  for (const s of [A, B])
    if (s.five.length < 5) throw new Error(`${s.label} fields only ${s.five.length}${s.satOut?.length ? ` with ${s.satOut.join(', ')} sitting out (already on the other side)` : ''}`)
  const result = batchSim(A.five, B.five, { n: o.n, seed: o.seed, assignment: ASSIGN, closest: CLOSEST })
  return { label: o.label ?? `${A.label} vs ${B.label}`, a: A, b: B, starters: o.kind, assignment: ASSIGN, result }
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`
const sgn = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`
const surname = (n: string) => n.replace(/ '\d\d$/, '').split(' ').slice(1).join(' ') || n
const sideLine = (s: Side) =>
  `${s.label} — ${s.five.map((p) => surname(p.name)).join(', ')}` +
  (s.kind ? `  [${s.kind === 'real' ? `real starters, by ${s.basis === 'mp' ? 'minutes (no starts kept)' : 'games started'}` : 'best five by OVR'}]` : '') +
  (s.missing?.length ? `  no card: ${s.missing.join(', ')}` : '') +
  (s.satOut?.length ? `  sat out (on the other side): ${s.satOut.join(', ')}` : '')

function print(r: Run) {
  const x = r.result
  const out: string[] = []
  out.push(`A  ${sideLine(r.a)}`)
  out.push(`B  ${sideLine(r.b)}`)
  out.push(`${x.n.toLocaleString('en-US')} series · seeds ${x.seed}..${seriesSeed(x.seed, x.n - 1)} (series i = base + i) · sigma ${x.sigma} · best of ${2 * x.toWin - 1} · A defends ${r.assignment}`)
  out.push('')
  out.push(`                 ${r.a.ab.padStart(7)} ${r.b.ab.padStart(7)}`)
  out.push(`Series won       ${pct(x.aPct).padStart(7)} ${pct(1 - x.aPct).padStart(7)}`)
  out.push(`Card (odds)      ${pct(x.card.series).padStart(7)} ${pct(1 - x.card.series).padStart(7)}   gap ${sgn(100 * (x.aPct - x.card.series))} pts`)
  out.push(`Games won        ${pct(x.gamePct).padStart(7)} ${pct(1 - x.gamePct).padStart(7)}   card ${pct(x.card.game)}`)
  out.push(`Margin / game    ${sgn(x.avgMargin).padStart(7)}           card spread ${sgn(x.card.spread)}`)
  out.push('')
  out.push(`${'Length'.padEnd(16)} ${r.a.ab.padStart(7)} ${r.b.ab.padStart(7)}     all`)
  for (const l of x.lengths) out.push(`${`  ${l.games} games`.padEnd(16)} ${pct(l.a / x.n).padStart(7)} ${pct(l.b / x.n).padStart(7)} ${pct((l.a + l.b) / x.n).padStart(7)}`)
  if (x.closest.length) {
    out.push('')
    out.push(`Closest Game ${2 * x.toWin - 1}s (replay: makeRng(seed) on these two fives)`)
    out.push(`  ${'seed'.padStart(10)}   final             margin`)
    for (const d of x.closest) out.push(`  ${String(d.seed).padStart(10)}   ${r.a.ab} ${d.a}–${d.b} ${r.b.ab}`.padEnd(34) + `${d.margin >= 0 ? '+' : '−'}${Math.abs(d.margin).toFixed(3)}  ${d.aWon ? r.a.ab : r.b.ab} wins`)
  }
  console.log(out.join('\n'))
}
const toJson = (r: Run) => ({
  label: r.label,
  starters: r.starters,
  assignment: r.assignment,
  a: { ...r.a, five: r.a.five.map((p) => p.name) },
  b: { ...r.b, five: r.b.five.map((p) => p.name) },
  ...r.result,
})

const file = flags.get('file')
try {
  if (file) {
    const list = JSON.parse(readFileSync(file, 'utf8')) as { a: SideSpec; b: SideSpec; starters?: string; n?: number; seed?: number; label?: string; allowDupes?: boolean }[]
    if (!Array.isArray(list)) fail(`${file}: expected a JSON array of { a, b }`)
    // one matchup that cannot be played is reported in its row; it does not sink the other fifty-nine
    const runs = list.map((m, i) => {
      try {
        return run(m.a, m.b, { kind: kindOf(m.starters ?? flags.get('starters')), n: m.n ?? N, seed: m.seed ?? SEED, label: m.label, dupes: m.allowDupes })
      } catch (e) {
        return { label: m.label ?? `#${i + 1} ${JSON.stringify(m.a)} vs ${JSON.stringify(m.b)}`, error: (e as Error).message }
      }
    })
    const json = runs.map((r) => ('error' in r ? r : toJson(r)))
    const outPath = flags.get('out') ?? file.replace(/\.json$/i, '') + '.results.json'
    writeFileSync(outPath, JSON.stringify(json, null, 2))
    if (JSON_OUT) console.log(JSON.stringify(json, null, 2))
    else {
      const w = Math.max(...runs.map((r) => r.label.length), 8)
      console.log(`${'matchup'.padEnd(w)}  ${'A won'.padStart(6)} ${'card'.padStart(6)}   gap   4g/5g/6g/7g (A+B)          margin  closest G7`)
      for (const r of runs) {
        if ('error' in r) {
          console.log(`${r.label.padEnd(w)}  — not played: ${r.error}`)
          continue
        }
        const x = r.result
        const len = x.lengths.map((l) => pct((l.a + l.b) / x.n)).join('/')
        const c = x.closest[0]
        console.log(
          `${r.label.padEnd(w)}  ${pct(x.aPct).padStart(6)} ${pct(x.card.series).padStart(6)} ${sgn(100 * (x.aPct - x.card.series)).padStart(5)}   ${len.padEnd(26)} ${sgn(x.avgMargin).padStart(6)}  ${c ? `${c.seed} (${c.a}–${c.b})` : '—'}`,
        )
      }
      console.log(`\n${runs.length} matchups · wrote ${outPath}`)
    }
  } else {
    if (pos.length !== 2) fail('usage: npm run batch-sim -- <A> <B> [--n 10000] [--seed 1] [--starters real|best] [--assign optimal|naive] [--closest 10] [--allow-dupes] [--json]\n       npm run batch-sim -- --file matchups.json [--out results.json]\n  a side is 1996-CHI (team-season) or L12 (ladder level)')
    const r = run(pos[0], pos[1], { kind: KIND, n: N, seed: SEED })
    if (JSON_OUT) console.log(JSON.stringify(toJson(r), null, 2))
    else print(r)
  }
} catch (e) {
  fail((e as Error).message)
}
