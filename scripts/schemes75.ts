/** recal_75 design probe. Two jobs, both read-only:
 *  (1) DISTINGUISHABILITY — seven candidate schemes priced off 4,000 random matchups, pairwise
 *      Pearson on the fit vectors. Any pair >= ~0.90 reads identically off our cards and one is cut.
 *      MEASURED: press~blitz r 0.769 (a strict subset — hands+legs with no foul cost) and
 *      pack~zone r 0.868. Both cut; the five survivors are drop/switch/blitz/zone/ice.
 *  (2) CALIBRATION — each survivor is SHAPE (our five) + a signed OPPONENT DELTA (0 when no
 *      opponent is known). This prints the raw shape mean/spread per scheme so the centering
 *      constants in engine/tactics.ts (SHAPE_CAL) can be derived: every scheme must read ~57 for a
 *      typical five with a comparable spread, or the panel would only ever recommend one of them.
 *  Re-run after any card change that moves the defensive attributes. */
import { PLAYERS } from '../src/engine/pool'
import { makeRng } from '../src/engine/rng'
import type { Player } from '../src/engine/types'

const rng = makeRng(7575)
const pool = PLAYERS.filter((p) => p.ovr >= 55)
const five = (): Player[] => {
  const out: Player[] = []
  const seen = new Set<string>()
  while (out.length < 5) {
    const p = pool[Math.floor(rng.next() * pool.length)]
    if (!seen.has(p.player)) {
      seen.add(p.player)
      out.push(p)
    }
  }
  return out
}
const mean = (f: Player[], g: (p: Player) => number) => f.reduce((t, p) => t + g(p), 0) / f.length
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const heightIdx = (f: Player[]) => clamp((mean(f, (p) => p.attrs.height) - 71) * 7, 0, 100)

/** SHAPE: what the five brings, before any opponent is known. */
const SHAPE: Record<string, (a: Player[]) => number> = {
  drop: (a) => 0.62 * Math.max(...a.map((p) => p.attrs.rimprot)) + 0.38 * mean(a, (p) => p.attrs.discipline),
  switch: (a) => {
    const hs = a.map((p) => p.attrs.height)
    return (
      0.55 * Math.min(...a.map((p) => p.attrs.perdef)) +
      0.25 * mean(a, (p) => p.attrs.perdef) +
      0.2 * clamp(100 - 6 * (Math.max(...hs) - Math.min(...hs)), 0, 100)
    )
  },
  blitz: (a) => 0.5 * mean(a, (p) => p.attrs.perimdisrupt) + 0.25 * mean(a, (p) => p.attrs.durability) + 0.25 * mean(a, (p) => p.attrs.discipline),
  zone: (a) => 0.35 * heightIdx(a) + 0.3 * mean(a, (p) => p.attrs.drb) + 0.35 * Math.max(...a.map((p) => p.attrs.rimprot)),
  ice: (a) => 0.55 * mean(a, (p) => p.attrs.perdef) + 0.25 * mean(a, (p) => p.attrs.discipline) + 0.2 * Math.max(...a.map((p) => p.attrs.rimprot)),
  // the two casualties, kept here as the evidence for cutting them
  press: (a) => 0.6 * mean(a, (p) => p.attrs.perimdisrupt) + 0.4 * mean(a, (p) => p.attrs.durability),
  pack: (a) => 0.45 * mean(a, (p) => p.attrs.rimprot) + 0.3 * mean(a, (p) => p.attrs.drb) + 0.25 * mean(a, (p) => p.attrs.discipline),
}

/** OPPONENT DELTA: signed, centered on zero — what THIS opponent does to the call. */
const OPP: Record<string, (b: Player[]) => number> = {
  drop: (b) => 0.3 * (55 - mean(b, (p) => p.attrs['3pt'])),
  switch: (b) => 0.22 * (mean(b, (p) => p.attrs.playvol) - 55) - 0.16 * (Math.max(...b.map((p) => p.attrs.rim)) - 60),
  blitz: (b) => {
    const star = b.reduce((m, p) => (p.attrs.usg_raw > m.attrs.usg_raw ? p : m), b[0])
    return 0.28 * (55 - star.attrs.ballsec) + 0.42 * (star.attrs.usg_raw - 22)
  },
  zone: (b) => -0.3 * (mean(b, (p) => p.attrs['3pt']) - 55) - 0.18 * (mean(b, (p) => p.attrs.orb) - 50),
  ice: (b) => 0.24 * (mean(b, (p) => p.attrs.playvol) - 55) - 0.2 * (mean(b, (p) => p.attrs.mid) - 50),
  press: (b) => 0.3 * (55 - mean(b, (p) => p.attrs.ballsec)),
  pack: (b) => 0.3 * (55 - mean(b, (p) => p.attrs['3pt'])),
}

const keys = Object.keys(SHAPE)
const shapeV: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, []]))
const fullV: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, []]))
for (let i = 0; i < 4000; i++) {
  const A = five()
  const B = five()
  for (const k of keys) {
    shapeV[k].push(SHAPE[k](A))
    fullV[k].push(SHAPE[k](A) + OPP[k](B))
  }
}
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const pear = (xs: number[], ys: number[]) => {
  const mx = avg(xs)
  const my = avg(ys)
  let n = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < xs.length; i++) {
    n += (xs[i] - mx) * (ys[i] - my)
    dx += (xs[i] - mx) ** 2
    dy += (ys[i] - my) ** 2
  }
  return n / Math.sqrt(dx * dy)
}
console.log('RAW SHAPE distributions (4,000 random fives) — the centering inputs:')
for (const k of keys) {
  const v = [...shapeV[k]].sort((a, b) => a - b)
  const half = (v[3600] - v[400]) / 2
  console.log(`  ${k.padEnd(7)} mean ${avg(v).toFixed(2)}  p10 ${v[400].toFixed(1)}  p90 ${v[3600].toFixed(1)}  half-span ${half.toFixed(2)}  => scale ${(13 / half).toFixed(3)}`)
}
console.log('\nPAIRWISE CORRELATION of the full fit (>= 0.90 = duplicate):')
for (let i = 0; i < keys.length; i++)
  for (let j = i + 1; j < keys.length; j++) {
    const r = pear(fullV[keys[i]], fullV[keys[j]])
    if (Math.abs(r) >= 0.6) console.log(`  ${keys[i].padEnd(7)} vs ${keys[j].padEnd(7)} r = ${r.toFixed(3)}${Math.abs(r) >= 0.9 ? '   <-- DUPLICATE, CUT ONE' : '   (related, both kept)'}`)
  }
console.log('\nOPPONENT DELTA spread (0 = opponent-blind):')
for (const k of keys) {
  const d: number[] = []
  for (let i = 0; i < 1200; i++) d.push(OPP[k](five()))
  const s = [...d].sort((a, b) => a - b)
  console.log(`  ${k.padEnd(7)} mean ${avg(d).toFixed(2)}  p10 ${s[120].toFixed(1)}  p90 ${s[1080].toFixed(1)}`)
}

// ---- PER-SCHEME HARNESS VERDICT (the r59 law, scheme by scheme) ----
// The aggregate 'scheme' row passing does not prove each survivor earns its slot: a scheme that is
// never the oracle pick is dead weight, and one that is always the pick is a free lunch. This is
// the per-scheme column of receipt 75.
import { DEFAULT_TACTICS, SCHEMES, schemeFit, schemePts } from '../src/engine/tactics'
const rng2 = makeRng(20260828)
const five2 = (): Player[] => {
  const out: Player[] = []
  const seen = new Set<string>()
  while (out.length < 5) {
    const p = pool[Math.floor(rng2.next() * pool.length)]
    if (!seen.has(p.player)) { seen.add(p.player); out.push(p) }
  }
  return out
}
const MS = Array.from({ length: 2000 }, () => ({ A: five2(), B: five2() }))
const live = SCHEMES.filter((s) => s.key !== 'matchup')
const stat: Record<string, { blind: number[]; best: number; fits: number[] }> = {}
for (const s of live) stat[s.key] = { blind: [], best: 0, fits: [] }
let defaultBest = 0
for (const m of MS) {
  let bk = ''
  let bv = 0 // matchup (the default) is worth exactly 0
  for (const s of live) {
    const v = schemePts({ ...DEFAULT_TACTICS, scheme: s.key }, m.A, m.B)
    stat[s.key].blind.push(v)
    stat[s.key].fits.push(schemeFit(s.key, m.A, m.B))
    if (v > bv) { bv = v; bk = s.key }
  }
  if (bk) stat[bk].best++
  else defaultBest++
}
console.log('\nPER-SCHEME HARNESS VERDICT (2,000 matchups):')
for (const s of live) {
  const st = stat[s.key]
  const f = [...st.fits].sort((a, b) => a - b)
  console.log(
    `  ${s.key.padEnd(7)} blind EV ${(avg(st.blind) >= 0 ? '+' : '')}${avg(st.blind).toFixed(2)}  best call in ${((100 * st.best) / MS.length).toFixed(1)}%  ` +
      `fit p10 ${f[200].toFixed(0)} med ${f[1000].toFixed(0)} p90 ${f[1800].toFixed(0)}  max upside ${Math.max(...st.blind).toFixed(2)}`,
  )
}
console.log(`  matchup (default) is the best call in ${((100 * defaultBest) / MS.length).toFixed(1)}% — the tax is real`)
