/**
 * THE SCOUT — the detector that hunts for cards that look wrong.
 *
 * Tomer recalibrates by ruling on individual cards. Finding the card is currently hand work: he
 * scrolls the board until something offends him. This script does that scrolling. It knows nothing
 * about basketball; every check is a DISAGREEMENT between two numbers the pipeline already holds,
 * measured within the season so eras compare fairly, and every flag names the STAGE a ruling would
 * go to (`stats-to-ratings` for an attribute, `ratings-to-off-def` for OFF/DEF/OVR).
 *
 *     vite-node scripts/scout.ts                    the report on shipped data
 *     vite-node scripts/scout.ts --top 40           longer lists (default 25)
 *     vite-node scripts/scout.ts --base HEAD~3      + the collateral report against that ref
 *     vite-node scripts/scout.ts --json             the same flags as JSON
 *     vite-node scripts/scout.ts --only 3,4         run only those checks
 *
 * A flag is a SUSPICION, never a verdict. Several things this finds are doctrine and are supposed
 * to look strange (Jordan's out ~23, lob finishers in the 60s on paint, pre-97 inferred zones
 * compressing superstars) — see data/RATINGS_UPDATE.md "Known, accepted properties". The scout
 * agent that reads this output is the filter for those; the script does not soften them itself,
 * because a check that hides its own false positives cannot be tuned.
 *
 * TWO STRUCTURAL FACTS the checks are built around, both learned by measuring rather than assuming:
 *
 *   1. EVERY CHECK THAT COMPARES A CARD TO A BOX LINE IS BIASED BY CLASS. BPM dislikes a low-usage,
 *      low-efficiency centre and adores a pass-first guard, so a raw OVR-vs-BPM gap ranks the same
 *      two archetypes over and over and finds nothing about any individual man. Check 1 therefore
 *      measures each card against the DISAGREEMENT ITS OWN CLASS NORMALLY SHOWS (median and MAD
 *      inside big / perimeter), so what surfaces is a card odd even among cards shaped like it.
 *
 *   2. ATTRIBUTES ARE SMOOTHED 20/60/20 ACROSS ADJACENT SEASONS, box lines are not. Verified:
 *      Mason Plumlee '22 has attrs.ft 50 against a raw 39.2 FT%, and .2*66.9 + .6*39.2 + .2*63.6 =
 *      49.6. So an attribute disagreeing with its own season's rate by a handful of points is the
 *      smoother doing its job. Only a gap far too large for the smoother is evidence of anything.
 *
 * HONEST LIMITS of src/data/stats.json: it carries `bpm` and `vorp` but NOT their offensive and
 * defensive splits (no obpm/dbpm), no shot ATTEMPTS (3P% with no 3PA beside it), no offensive /
 * defensive rebound split, and no All-Defensive selections. Wherever a check would have wanted one
 * of those it says so in its own header instead of inventing a substitute and pretending.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { PLAYERS } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

/** Which agent a ruling on this flag would be handed to. `pipeline` means neither: it is a bug. */
type Stage = 'stats-to-ratings' | 'ratings-to-off-def' | 'pipeline'

interface Flag {
  check: string
  card: string
  stage: Stage
  /** 0-100. Comparable WITHIN a check; across checks it only orders the printout. */
  severity: number
  reason: string
  values: Record<string, number | string | boolean | null>
}

interface Box {
  team: string
  pos: string[]
  gp: number
  mpg: number
  ppg: number
  rpg: number
  apg: number
  spg: number
  bpg: number
  topg: number
  fgp: number
  tpp?: number
  ftp: number
  ts: number
  per: number
  ws: number
  bpm: number
  vorp: number
  usg: number
}

const EOL = String.fromCharCode(10)
const STATS = JSON.parse(readFileSync('src/data/stats.json', 'utf8')) as Record<string, Box>
const PIPELINE = JSON.parse(readFileSync('src/data/pipeline.json', 'utf8')) as { version: number; cards: number }

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

const argv = process.argv.slice(2)
const flagArg = (name: string): string | null => {
  const i = argv.indexOf(name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null
}
const TOP = Number(flagArg('--top') ?? 25)
const HALF = Math.max(5, Math.round(TOP / 2))
const BASE = flagArg('--base')
const AS_JSON = argv.includes('--json')
const ONLY = (flagArg('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const wanted = (id: string) => ONLY.length === 0 || ONLY.includes(id)

// ---------------------------------------------------------------------------------------------
// Season statistics: percentiles and average ranks, computed once
// ---------------------------------------------------------------------------------------------

/**
 * Average rank, 1 = best. TIES SHARE THEIR MEAN RANK, which matters more here than anywhere else
 * in the repo: OVR is an integer over a ~213-card season, so a dozen men sit on the same value and
 * an arbitrary tie-break would manufacture rank gaps out of nothing.
 */
function avgRanks(vals: (number | null)[]): (number | null)[] {
  const idx = vals.map((v, i) => [v, i] as const).filter((e) => e[0] !== null) as [number, number][]
  idx.sort((a, b) => b[0] - a[0])
  const out: (number | null)[] = vals.map(() => null)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const mean = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[idx[k][1]] = mean
    i = j + 1
  }
  return out
}

/** Fraction of the season below this value, 0-1; a run of ties sits at the middle of its own run. */
function pctOf(sortedAsc: number[], v: number): number {
  const bound = (strict: boolean) => {
    let lo = 0
    let hi = sortedAsc.length
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (strict ? sortedAsc[m] < v : sortedAsc[m] <= v) lo = m + 1
      else hi = m
    }
    return lo
  }
  return (bound(true) + bound(false)) / 2 / Math.max(1, sortedAsc.length)
}

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
/** Median absolute deviation, scaled to a standard deviation. Robust: one Shaq cannot move it. */
const mad = (xs: number[]) => {
  const m = median(xs)
  return 1.4826 * median(xs.map((x) => Math.abs(x - m))) || 1e-9
}

interface Card {
  p: Player
  b: Box | null
  season: number
  /** Season size, for rank-gap normalisation. */
  n: number
  /** True when this card's box line is shared with another card — see the integrity block below. */
  boxSuspect: boolean
  m: Record<string, number | null>
  pct: Record<string, number>
  rank: Record<string, number | null>
}

const per36 = (v: number | undefined, mpg: number | undefined) =>
  v === undefined || !mpg || mpg <= 0 ? null : (v * 36) / mpg

/** Every metric the checks read, named once so percentiles and ranks are built from one list. */
function metricsOf(p: Player, b: Box | null): Record<string, number | null> {
  const a = p.attrs
  return {
    ovr: p.ovr,
    o_ovr: p.o_ovr,
    d_ovr: p.d_ovr,
    talent: p.talent,
    marg: p.marg,
    pd: p.pd,
    a_3pt: a['3pt'],
    a_rim: a.rim,
    a_mid: a.mid,
    a_ft: a.ft,
    a_fouldraw: a.fouldraw,
    a_orb: a.orb,
    a_drb: a.drb,
    a_playvol: a.playvol,
    a_ballsec: a.ballsec,
    a_volume: a.volume,
    a_efficiency: a.efficiency,
    a_durability: a.durability,
    a_rimprot: a.rimprot,
    a_perimdisrupt: a.perimdisrupt,
    a_perdef: a.perdef,
    a_discipline: a.discipline,
    a_height: a.height,
    bpm: b?.bpm ?? null,
    vorp: b?.vorp ?? null,
    per: b?.per ?? null,
    ws: b?.ws ?? null,
    ts: b?.ts ?? null,
    usg: b?.usg ?? null,
    mpg: b?.mpg ?? null,
    gp: b?.gp ?? null,
    tpp: b?.tpp ?? null,
    ftp: b?.ftp ?? null,
    ppg36: per36(b?.ppg, b?.mpg),
    apg36: per36(b?.apg, b?.mpg),
    rpg36: per36(b?.rpg, b?.mpg),
    spg36: per36(b?.spg, b?.mpg),
    bpg36: per36(b?.bpg, b?.mpg),
    topg36: per36(b?.topg, b?.mpg),
  }
}

const CARDS: Card[] = PLAYERS.map((p) => {
  const b = STATS[p.name] ?? null
  return { p, b, season: p.peak_season, n: 0, boxSuspect: false, m: metricsOf(p, b), pct: {}, rank: {} }
})
const BY_NAME = new Map(CARDS.map((c) => [c.p.name, c]))

/**
 * INTEGRITY, before anything is measured. Two cards in the same season carrying a BYTE-IDENTICAL
 * box line are two men joined to one Basketball-Reference row: the same-name disambiguation ("(b)")
 * survives into the card name but not into the join. Their box-score evidence is worthless, so they
 * are excluded from every box-based check rather than allowed to generate confident nonsense.
 */
const INTEGRITY: string[][] = (() => {
  const sig = new Map<string, Card[]>()
  for (const c of CARDS) {
    if (!c.b) continue
    const k = `${c.season}|${JSON.stringify(c.b)}`
    const l = sig.get(k)
    if (l) l.push(c)
    else sig.set(k, [c])
  }
  const groups: string[][] = []
  for (const [, l] of sig) {
    if (l.length < 2) continue
    for (const c of l) c.boxSuspect = true
    groups.push(l.map((c) => c.p.name))
  }
  return groups.sort()
})()

const SEASONS = new Map<number, Card[]>()
for (const c of CARDS) {
  const l = SEASONS.get(c.season)
  if (l) l.push(c)
  else SEASONS.set(c.season, [c])
}
const METRIC_KEYS = Object.keys(CARDS[0].m)

for (const [, list] of SEASONS) {
  for (const c of list) c.n = list.length
  for (const k of METRIC_KEYS) {
    const vals = list.map((c) => c.m[k])
    const present = vals.filter((v) => v !== null) as number[]
    present.sort((x, y) => x - y)
    for (let i = 0; i < list.length; i++) {
      const v = vals[i]
      list[i].pct[k] = v === null ? 0.5 : pctOf(present, v)
    }
    const r = avgRanks(vals)
    for (let i = 0; i < list.length; i++) list[i].rank[k] = r[i]
  }
}

/**
 * OBPM-ISH, and no pretence otherwise. stats.json has no obpm, so the offensive side of a box line
 * has to be rebuilt from what it does carry: a within-season percentile blend of the two all-in-one
 * numbers that lean offensive and the two rate stats that are purely offensive. It is used for one
 * job — spotting an OFF number that disagrees with the whole of a man's offensive box line — and its
 * flags are graded below the BPM ones because it is a construction, not a measurement.
 *
 * THERE IS NO DEF EQUIVALENT AND NONE IS FAKED. Blocks and steals are not defence; a dbpm-less
 * defensive proxy would flag every drop-coverage centre in the pool and teach the reader nothing.
 */
for (const [, list] of SEASONS) {
  const offVals: number[] = []
  for (const c of list) {
    const v = 0.34 * c.pct.per + 0.28 * c.pct.ppg36 + 0.2 * c.pct.apg36 + 0.18 * c.pct.ts
    c.m.off_proxy = c.b ? v : null
    if (c.b) offVals.push(v)
  }
  offVals.sort((a, b) => a - b)
  const r = avgRanks(list.map((c) => c.m.off_proxy))
  for (let i = 0; i < list.length; i++) {
    list[i].pct.off_proxy = list[i].m.off_proxy === null ? 0.5 : pctOf(offVals, list[i].m.off_proxy as number)
    list[i].rank.off_proxy = r[i]
  }
}

// ---------------------------------------------------------------------------------------------
// The formula's own shapes, recomputed here so a flag can say WHY a card was treated unusually.
// Mirrors data/compute_ovr.py. READ-ONLY: nothing here is ever a second source for a number.
// ---------------------------------------------------------------------------------------------

/** The zone-dominance gate from o_score (recal_37/43): one weapon towering over the rest. */
function hasDominance(p: Player): boolean {
  const a = p.attrs
  const z = [a['3pt'], a.rim, a.mid].sort((x, y) => y - x)
  return Math.max(a['3pt'], a.rim) >= a.mid && ((z[0] > z[1] + z[2] && z[0] >= 91) || z[0] > 1.5 * (z[1] + z[2]))
}
/** o_score's standard path, before any bonus, floor or hub. Every input is on the sheet. */
function oStdBase(p: Player): number {
  const a = p.attrs
  const z = [a['3pt'], a.rim, a.mid].sort((x, y) => y - x)
  return (
    0.22 * z[0] + 0.08 * z[1] + 0.05 * z[2] + 0.11 * a.efficiency + 0.26 * a.volume + 0.19 * a.playvol +
    0.1 * a.ballsec + 0.11 * ((a.fouldraw * a.ft) / 100) + 0.06 * a.orb +
    0.08 * ((Math.max(a.volume, 50) * a.efficiency) / 100)
  )
}
/** THE BIG HUB (recal_55): an efficient playmaking centre gets a channel of his own. */
const bigHub = (p: Player) => p.big && p.attrs.playvol >= 60
/**
 * THE OFF-BALL FLOOR (recal_64, the OKC problem): a low-usage shooter's standard path is replaced
 * by a floor priced on spacing rather than load. It REPLACES the sum, so a card sitting on it is
 * not being scored by the same law as the man beside him — which is why it belongs in this list.
 */
function offBallFloor(p: Player): { eligible: boolean; value: number; binds: boolean } {
  const a = p.attrs
  const eligible = a['3pt'] >= 68 && a.volume < 55
  const value = 0.38 * a['3pt'] + 0.2 * a.efficiency + 0.08 * a.ballsec + 0.06 * a.discipline
  return { eligible, value, binds: eligible && value > oStdBase(p) }
}
/** The OVR cap (recal_3): o+10 on the perimeter, o+40 for a big. Returns the cap and whether it bit. */
function capOf(p: Player) {
  const raw = Math.max(0.4 * p.o_ovr + 0.6 * p.d_ovr, 0.7 * p.o_ovr + 0.3 * p.d_ovr)
  const cap = p.big ? p.o_ovr + 40 : Math.max(p.o_ovr + 10, 0.85 * p.d_ovr)
  return { cap, binds: Math.round(raw) > cap, raw }
}
/** The size modifier on the perimeter d_score branch: bites only truly small defenders. */
const sizeMod = (p: Player) => Math.min(1, 0.94 + (0.06 * (p.attrs.height - 71)) / 7)
const KNEE = 93

// ---------------------------------------------------------------------------------------------
// Report plumbing
// ---------------------------------------------------------------------------------------------

const FLAGS: Flag[] = []
const SECTIONS: string[] = []
const push = (f: Flag) => void FLAGS.push(f)
const section = (title: string, note: string, lines: string[]) => {
  SECTIONS.push(
    [`${EOL}${'='.repeat(112)}`, title, '-'.repeat(112), note, '', ...(lines.length ? lines : ['  (nothing flagged)'])].join(EOL),
  )
}
/** One printed flag line: card, the numbers that make it suspicious, the stage. */
const lineOf = (f: Flag) => {
  const vals = Object.entries(f.values)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}`)
    .join(' ')
  return `  ${String(Math.round(f.severity)).padStart(3)}  ${f.card.padEnd(28)} ${f.reason.padEnd(52)} ${vals.padEnd(56)} -> ${f.stage}`
}
const emit = (lines: string[], check: string) => {
  for (const f of FLAGS.filter((x) => x.check === check)) lines.push(lineOf(f))
  lines.push('')
}

// =============================================================================================
// CHECK 1 — OVR against the box-score rank, normalised inside the class
// =============================================================================================

if (wanted('1')) {
  const lines: string[] = []
  const pass = (scoreKey: string, boxKey: string, label: string, grade: number, take: number) => {
    const elig = CARDS.filter((c) => {
      if (!c.b || c.boxSuspect) return false
      const rs = c.rank[scoreKey]
      const rb = c.rank[boxKey]
      if (rs === null || rb === null) return false
      if (c.b.gp < 40) return false
      // A card has to matter on ONE of the two sides. Without this the list is deep-bench seasons
      // where both ranks are noise and the gap is an artefact of season size.
      return Math.min(rs, rb) <= c.n * 0.35
    })
    // The class correction. `d` is the signed disagreement in percentile points; its median inside
    // a class is the archetype bias (bigs sit well above their BPM, pass-first guards well below),
    // and dividing by the class MAD asks the only question worth asking: is this card strange FOR
    // A CARD OF ITS SHAPE? Without this the same twenty men fill the list every run.
    const stat = new Map<boolean, { med: number; sd: number }>()
    for (const big of [true, false]) {
      const ds = elig.filter((c) => c.p.big === big).map((c) => c.pct[scoreKey] - c.pct[boxKey])
      stat.set(big, { med: median(ds), sd: mad(ds) })
    }
    const scored = elig
      .map((c) => {
        const s = stat.get(c.p.big) as { med: number; sd: number }
        const d = c.pct[scoreKey] - c.pct[boxKey]
        return { c, d, z: (d - s.med) / s.sd }
      })
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    const bias = [true, false].map((b) => `${b ? 'big' : 'perim'} median gap ${((stat.get(b) as { med: number }).med * 100).toFixed(0)}pts`).join(', ')
    lines.push(`  ${label}  (${elig.length} eligible; class bias removed: ${bias}; showing ${Math.min(take, scored.length)})`)
    for (const { c, d, z } of scored.slice(0, take)) {
      push({
        check: `1 ${label}`,
        card: c.p.name,
        stage: 'ratings-to-off-def',
        severity: Math.min(100, Math.abs(z) * 20 * grade),
        reason: `${d > 0 ? 'ABOVE' : 'BELOW'} its ${boxKey} by ${Math.abs(z).toFixed(1)} class sigma (${c.p.big ? 'big' : 'perimeter'})`,
        values: {
          [scoreKey]: c.m[scoreKey] as number,
          rank_score: Math.round(c.rank[scoreKey] as number),
          [boxKey]: Number((c.m[boxKey] as number).toFixed(2)),
          rank_box: Math.round(c.rank[boxKey] as number),
          season_n: c.n,
          class_sigma: Number(z.toFixed(1)),
        },
      })
    }
    emit(lines, `1 ${label}`)
  }
  pass('ovr', 'bpm', 'OVR vs BPM', 1, TOP)
  pass('ovr', 'vorp', 'OVR vs VORP', 0.8, HALF)
  pass('o_ovr', 'off_proxy', 'OFF vs offensive-box proxy', 0.7, HALF)
  section(
    'CHECK 1 — OVR / OFF against the box-score rank, within the season and within the class',
    [
      '  Ranked inside each season (ties share their mean rank). The raw gap is then measured against the gap',
      '  its own class normally shows, because BPM has a large, known archetype bias: a low-usage centre sits',
      '  far above his BPM by construction and a pass-first guard far below, and an uncorrected list is those',
      '  two archetypes twenty times over. A card must be top-35% on one side and have played 40 games.',
      '  NOTE: stats.json carries no obpm/dbpm. There is therefore NO DEF-vs-box pass — none can be honest —',
      '  and the OFF pass runs on a percentile blend (per .34 / pts36 .28 / ast36 .20 / TS .18), graded lower.',
    ].join(EOL),
    lines,
  )
}

// =============================================================================================
// CHECK 2 — season whiplash
// =============================================================================================

if (wanted('2')) {
  // Only attributes that actually FEED the scale in question can be the cause of its swing. Without
  // this scoping the biggest mover on the sheet gets the blame, and a DEF swing gets attributed to
  // `durability`, which does not appear anywhere in d_score.
  const FEEDS: Record<string, readonly string[]> = {
    o_ovr: ['3pt', 'rim', 'mid', 'ft', 'fouldraw', 'orb', 'playvol', 'ballsec', 'volume', 'efficiency'],
    d_ovr: ['perdef', 'rimprot', 'perimdisrupt', 'drb', 'discipline'],
    ovr: ['3pt', 'rim', 'mid', 'ft', 'fouldraw', 'orb', 'playvol', 'ballsec', 'volume', 'efficiency',
      'perdef', 'rimprot', 'perimdisrupt', 'drb', 'discipline'],
  }
  const byPlayer = new Map<string, Card[]>()
  for (const c of CARDS) {
    // The key carries the same-name suffix: the two Eddie Johnsons share a `player` field and must
    // not be walked as one career.
    const key = `${c.p.player}${/ \([a-z]\)$/.test(c.p.name) ? ' (b)' : ''}`
    const l = byPlayer.get(key)
    if (l) l.push(c)
    else byPlayer.set(key, [c])
  }
  const cand: { a: Card; b: Card; scale: string; key: 'ovr' | 'o_ovr' | 'd_ovr'; swing: number }[] = []
  for (const [, list] of byPlayer) {
    list.sort((x, y) => x.season - y.season)
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i]
      const b = list[i + 1]
      if (b.season - a.season !== 1 || !a.b || !b.b) continue
      if (a.b.gp < 40 || b.b.gp < 40) continue
      // "minutes stayed comparable" — a man who went from 12 mpg to 34 has earned the right to move.
      if (Math.abs(a.b.mpg - b.b.mpg) > 6) continue
      for (const [scale, key] of [['OVR', 'ovr'], ['OFF', 'o_ovr'], ['DEF', 'd_ovr']] as const) {
        cand.push({ a, b, scale, key, swing: (b.p[key] as number) - (a.p[key] as number) })
      }
    }
  }
  const lines2: string[] = []
  const at = (n: number) => cand.filter((x) => Math.abs(x.swing) >= n).length
  const shown = cand.filter((x) => Math.abs(x.swing) >= 12).sort((x, y) => Math.abs(y.swing) - Math.abs(x.swing))
  for (const { a, b, scale, key, swing } of shown.slice(0, TOP)) {
    // Where the swing came from. If an ATTRIBUTE moved as hard as the score did, the ruling belongs
    // to stats-to-ratings — compute_ovr only passed on what build_ratings handed it.
    let worst = { k: '', d: 0 }
    for (const k of FEEDS[key]) {
      const d = (b.p.attrs as unknown as Record<string, number>)[k] - (a.p.attrs as unknown as Record<string, number>)[k]
      if (Math.abs(d) > Math.abs(worst.d)) worst = { k, d }
    }
    const flipped = a.p.big !== b.p.big
    const traced = !flipped && Math.abs(worst.d) >= 0.6 * Math.abs(swing)
    push({
      check: `2 whiplash ${scale}`,
      card: b.p.name,
      stage: traced ? 'stats-to-ratings' : 'ratings-to-off-def',
      severity: Math.min(100, Math.abs(swing) * 4.5),
      reason:
        `${scale} ${swing > 0 ? '+' : ''}${swing} from ${a.p.name} at flat minutes` +
        (flipped ? `, CLASS FLIP ${a.p.big ? 'big' : 'perim'}->${b.p.big ? 'big' : 'perim'}` : traced ? `, tracks ${worst.k} ${worst.d > 0 ? '+' : ''}${worst.d}` : ''),
      values: {
        prev: a.p[key] as number,
        now: b.p[key] as number,
        mpg: `${a.b!.mpg}->${b.b!.mpg}`,
        bpm: `${a.b!.bpm}->${b.b!.bpm}`,
        [`d_${worst.k}`]: worst.d,
      },
    })
  }
  /**
   * CLASS FLIPS. `big` is not a fact about a man, it is a test run per SEASON: a lifetime PG/SG is
   * never big, a lifetime PF/C always is, and everyone else is judged on shape. The two d_score
   * branches are not near neighbours — 0.63 perdef on the perimeter against 0.40 perdef + 0.40
   * rimprot for a big — so a card that crosses the boundary between adjacent seasons can move
   * twenty DEF points on a position listing rather than on anything he did. Reported whatever the
   * size of the swing, because the flip itself is the finding.
   */
  {
    const flips: { a: Card; b: Card }[] = []
    for (const [, list] of byPlayer) {
      for (let i = 0; i + 1 < list.length; i++) {
        if (list[i + 1].season - list[i].season === 1 && list[i].p.big !== list[i + 1].p.big) flips.push({ a: list[i], b: list[i + 1] })
      }
    }
    flips.sort((x, y) => Math.abs(y.b.p.d_ovr - y.a.p.d_ovr) - Math.abs(x.b.p.d_ovr - x.a.p.d_ovr))
    lines2.push(`  CLASS FLIPS between adjacent seasons: ${flips.length} pairs (the d_score branch changed under the card)`)
    for (const { a, b } of flips.slice(0, HALF)) {
      const dd = b.p.d_ovr - a.p.d_ovr
      push({
        check: '2 class flip',
        card: b.p.name,
        stage: 'ratings-to-off-def',
        severity: Math.min(100, 30 + Math.abs(dd) * 3),
        reason: `${a.p.big ? 'big' : 'perimeter'} -> ${b.p.big ? 'big' : 'perimeter'} against ${a.p.name}, DEF ${dd > 0 ? '+' : ''}${dd}`,
        values: {
          d_ovr: `${a.p.d_ovr}->${b.p.d_ovr}`,
          perdef: `${a.p.attrs.perdef}->${b.p.attrs.perdef}`,
          rimprot: `${a.p.attrs.rimprot}->${b.p.attrs.rimprot}`,
          pos: `${(a.b?.pos ?? []).join('/')} -> ${(b.b?.pos ?? []).join('/')}`,
        },
      })
    }
    for (const f of FLAGS.filter((x) => x.check === '2 class flip')) lines2.push(lineOf(f))
  }
  section(
    'CHECK 2 — season whiplash: the same man, adjacent seasons, comparable minutes',
    [
      '  Adjacent seasons, both >= 40 games, |mpg difference| <= 6. Attributes are smoothed 20/60/20 across a',
      '  career, so a large swing at flat minutes means one season\'s raw input overwhelmed the smoother.',
      `  Pair-swings by size: >=8 ${at(8)}, >=12 ${at(12)}, >=16 ${at(16)}, >=20 ${at(20)}. The floor here is 12;`,
      '  the >=8 population is too large to be a work queue, which is itself the finding — DEF is the unstable',
      '  scale, and a line that says "tracks perdef" is a stats-to-ratings problem wearing an OFF/DEF costume.',
    ].join(EOL),
    [...FLAGS.filter((f) => f.check.startsWith('2 whiplash')).map(lineOf), '', ...lines2],
  )
}

// =============================================================================================
// CHECK 3 — attribute contradictions
// =============================================================================================

if (wanted('3')) {
  const lines: string[] = []
  /**
   * One contradiction: an attribute near the top of its season while the box-score rate it is
   * built from sits near the bottom of the same season. Thresholds are deliberately generous
   * (top 15% against bottom 30%, 60 percentile points apart) because the smoother alone can
   * separate an attribute from its own season by several points.
   */
  const contra = (
    id: string,
    attr: string,
    box: string,
    reason: string,
    take: number,
    extra?: (c: Card) => boolean,
  ) => {
    const hits = CARDS.filter((c) => {
      if (!c.b || c.boxSuspect || c.m[box] === null) return false
      if (extra && !extra(c)) return false
      return c.pct[attr] >= 0.85 && c.pct[box] <= 0.3 && c.pct[attr] - c.pct[box] >= 0.6
    })
      .map((c) => ({ c, gap: c.pct[attr] - c.pct[box] }))
      .sort((x, y) => y.gap - x.gap)
    lines.push(`  ${id}  (${hits.length} cards contradict; showing ${Math.min(take, hits.length)})`)
    for (const { c, gap } of hits.slice(0, take)) {
      push({
        check: `3 ${id}`,
        card: c.p.name,
        stage: 'stats-to-ratings',
        severity: Math.min(100, gap * 100),
        reason,
        values: {
          [attr]: c.m[attr] as number,
          [`${attr}_pct`]: Number((c.pct[attr] * 100).toFixed(0)),
          [box]: Number((c.m[box] as number).toFixed(2)),
          [`${box}_pct`]: Number((c.pct[box] * 100).toFixed(0)),
        },
      })
    }
    emit(lines, `3 ${id}`)
  }

  contra('rimprot vs blocks', 'a_rimprot', 'bpg36', 'top-15% rim protection, bottom-30% blocks', 6)
  contra('efficiency vs TS', 'a_efficiency', 'ts', 'top-15% efficiency rating, bottom-30% TS%', 6)
  contra('playvol vs assists', 'a_playvol', 'apg36', 'top-15% playmaking volume, bottom-30% assists', 6)
  contra('volume vs usage', 'a_volume', 'usg', 'top-15% volume rating, bottom-30% usage', 6)
  contra('orb vs rebounds', 'a_orb', 'rpg36', 'top-15% offensive rebounding, bottom-30% TOTAL rebounds', 6)
  contra('3pt vs 3P%', 'a_3pt', 'tpp', 'top-15% outside rating, bottom-30% 3P%', 6)
  // PERDEF vs STEALS: WRITTEN, MEASURED, AND REMOVED. It is left here as a comment rather than as a
  // silent absence, because the next person to build this check will have the same idea.
  //
  // perdef is a REPUTATION composite (All-D votes, DBPM, size, coach trust), so a low steal rate is
  // not a contradiction — it is what a drop-coverage stopper looks like. Run anyway, the rule flagged
  // 260 cards led by Dennis Rodman '98, Kevin McHale '86-'87 and Alonzo Mourning '00: the four or
  // five best defenders of their eras, every one of them correct on the card. That is a 100% false
  // positive rate at the top, which is worse than useless — it teaches the reader to skim.
  //
  // The obvious tightening, "and no defensive reputation either", IS NOT AVAILABLE: the card's `pd`
  // field is byte-identical to `attrs.perdef` on all 10,000 cards (measured here, not assumed), so it
  // is the same number wearing a second name and gates nothing. stats.json has no All-Defensive
  // field. There is no independent defensive-reputation signal in the app-side data, so there is no
  // honest version of this rule and none is printed.
  lines.push('  perdef vs steals  (NOT RUN — measured at ~100% false positives; see the comment in the source)')
  lines.push('')
  // durability is a MINUTES rating, not an availability one: a man who plays 39 mpg for 54 games can
  // out-rate a 25-mpg iron man. The flag therefore requires the minutes NOT to be elite either.
  contra('durability vs games', 'a_durability', 'gp', 'top-15% durability on few games AND ordinary minutes', 6, (c) => c.pct.mpg < 0.85)
  {
    const hits = CARDS.filter((c) => c.b && !c.boxSuspect && c.p.attrs['3pt'] >= 70 && (c.b.tpp === undefined || c.b.tpp === 0))
    lines.push(`  3pt with no threes made  (${hits.length} cards)`)
    for (const c of hits.slice(0, 6)) {
      push({
        check: '3 3pt with no threes',
        card: c.p.name,
        stage: 'stats-to-ratings',
        severity: 70,
        reason: 'outside rating >= 70 with 3P% absent or zero',
        values: { a_3pt: c.p.attrs['3pt'], tpp: c.b?.tpp ?? 'absent', season: c.season },
      })
    }
    emit(lines, '3 3pt with no threes')
  }
  // THE FT CANARY, and the reason it is a canary rather than a check. attrs.ft is documented as the
  // literal free-throw percentage; 858 cards differ from their own season's FT% by more than 3, and
  // every one of them is the 20/60/20 smoother (Mason Plumlee '22 above). The smoother's worst case
  // is bounded by the neighbours' spread, so the ALARM is set at 20 — a gap that large would be a
  // join error or a scale slip, not smoothing. It is expected to stay silent. When it speaks, the
  // stage is `pipeline`: nobody rules on a bug.
  {
    const d = (c: Card) => Math.abs(c.p.attrs.ft - (c.b as Box).ftp)
    const withBox = CARDS.filter((c) => c.b)
    const over3 = withBox.filter((c) => d(c) > 3)
    const alarm = withBox.filter((c) => d(c) > 20).sort((x, y) => d(y) - d(x))
    lines.push(
      `  ft attribute vs literal FT%  (${over3.length} cards over 3 apart — the smoother; ` +
        `worst gap ${Math.max(...withBox.map(d)).toFixed(1)}; alarm at 20: ${alarm.length})`,
    )
    for (const c of alarm.slice(0, 6)) {
      push({
        check: '3 ft canary',
        card: c.p.name,
        stage: 'pipeline',
        severity: Math.min(100, d(c) * 4),
        reason: 'ft attribute too far from the literal FT% for the smoother to explain',
        values: { a_ft: c.p.attrs.ft, ftp: c.b!.ftp, delta: Number(d(c).toFixed(1)) },
      })
    }
    emit(lines, '3 ft canary')
  }
  section(
    'CHECK 3 — attribute contradictions against the box line',
    [
      '  Each rule: attribute in the season\'s top 15% while the statistic it is built from sits in the season\'s',
      '  bottom 30%, at least 60 percentile points apart. Within-season throughout, so a 1981 steal rate is',
      '  judged against 1981. MOSTLY EMPTY BY CONSTRUCTION and that is the point: an attribute IS the within-',
      '  season percentile of its own rate, so a hit means an extra term (a vote, a size term, the smoother)',
      '  overrode the evidence. What CANNOT be checked, and is not claimed: 3-point ATTEMPTS (stats.json has',
      '  3P% only), the offensive/defensive rebound split (totals only), All-Defensive selections (absent).',
    ].join(EOL),
    lines,
  )
}

// =============================================================================================
// CHECK 4 — class outliers
// =============================================================================================

if (wanted('4')) {
  const SHEET = [
    'a_3pt', 'a_rim', 'a_mid', 'a_ft', 'a_fouldraw', 'a_orb', 'a_drb', 'a_playvol', 'a_ballsec',
    'a_volume', 'a_efficiency', 'a_durability', 'a_rimprot', 'a_perimdisrupt', 'a_perdef',
    'a_discipline', 'a_height',
  ]
  /**
   * The sheet, plus the SHAPES the pipeline reads that a plain sum of attributes cannot express.
   * Without these the model mis-specifies and every residual it reports is its own error rather than
   * the pipeline's: o_score weights the three zones AFTER SORTING them (an order statistic, not a
   * linear combination), multiplies volume by efficiency and fouldraw by ft, and d_score multiplies
   * the whole perimeter vector by a height-driven size modifier. Adding them is not cheating — it is
   * the difference between "this card is odd" and "my regression cannot do arithmetic".
   */
  const featVec = (c: Card, target: 'o_ovr' | 'd_ovr'): number[] => {
    const a = c.p.attrs
    const base = SHEET.map((f) => c.m[f] as number)
    if (target === 'o_ovr') {
      const z = [a['3pt'], a.rim, a.mid].sort((x, y) => y - x)
      return [...base, z[0], z[1], z[2], (Math.max(a.volume, 50) * a.efficiency) / 100, (a.fouldraw * a.ft) / 100]
    }
    const sm = sizeMod(c.p)
    return [...base, sm, a.perdef * sm, a.rimprot * sm, a.perimdisrupt * sm, a.drb * sm, a.discipline * sm]
  }
  /** Ordinary least squares by normal equations, ridge-stabilised, on standardised features. */
  function fit(rows: Card[], target: 'o_ovr' | 'd_ovr'): (c: Card) => number {
    const X = rows.map((c) => featVec(c, target))
    const k = X[0].length
    const mean = Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[j], 0) / rows.length)
    const sd = Array.from({ length: k }, (_, j) => Math.sqrt(X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / rows.length) || 1)
    const x = (c: Card) => [1, ...featVec(c, target).map((v, j) => (v - mean[j]) / sd[j])]
    const A: number[][] = Array.from({ length: k + 1 }, () => new Array(k + 2).fill(0))
    for (const c of rows) {
      const xi = x(c)
      const yi = c.p[target]
      for (let i = 0; i <= k; i++) {
        for (let j = 0; j <= k; j++) A[i][j] += xi[i] * xi[j]
        A[i][k + 1] += xi[i] * yi
      }
    }
    for (let i = 1; i <= k; i++) A[i][i] += 1e-6 * rows.length
    for (let col = 0; col <= k; col++) {
      let piv = col
      for (let r = col + 1; r <= k; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r
      ;[A[col], A[piv]] = [A[piv], A[col]]
      const dv = A[col][col] || 1e-12
      for (let j = col; j <= k + 1; j++) A[col][j] /= dv
      for (let r = 0; r <= k; r++) {
        if (r === col) continue
        const f = A[r][col]
        if (!f) continue
        for (let j = col; j <= k + 1; j++) A[r][j] -= f * A[col][j]
      }
    }
    const beta = A.map((r) => r[k + 1])
    return (c: Card) => x(c).reduce((s, v, i) => s + v * beta[i], 0)
  }

  const lines: string[] = []
  for (const target of ['o_ovr', 'd_ovr'] as const) {
    for (const isBig of [true, false]) {
      const rows = CARDS.filter((c) => c.p.big === isBig)
      const cls = isBig ? 'big' : 'perimeter'
      const scale = target === 'o_ovr' ? 'OFF' : 'DEF'
      const label = `${scale} residual, ${cls}`
      /** The formula's own nonlinearities. A residual these explain is exposure, not an anomaly. */
      const known = (c: Card) => {
        const w: string[] = []
        if (target === 'o_ovr' && hasDominance(c.p)) w.push('zone-dominance bonus')
        if (target === 'o_ovr' && bigHub(c.p)) w.push('big hub +0.05*playvol')
        if (target === 'o_ovr' && offBallFloor(c.p).eligible) w.push(`off-ball floor (${offBallFloor(c.p).binds ? 'binds' : 'eligible'})`)
        if ((c.p[target] as number) >= 99) w.push('99 ceiling')
        else if ((c.p[target] as number) >= KNEE) w.push('above the 93 knee')
        if (target === 'd_ovr' && !isBig && sizeMod(c.p) < 0.995) w.push(`size modifier x${sizeMod(c.p).toFixed(3)}`)
        return w
      }
      // THE MODEL IS FITTED ON THE PLAIN CARDS ONLY — no bonus, below the knee, no size modifier.
      // Fitting on everything lets the bonus bleed into the coefficients and then every plain card
      // carries a share of somebody else's bonus as "residual"; that is how the first version of
      // this check produced a page of DeMar DeRozan seasons that were nothing but arithmetic error.
      // Fitted on the plain cards, the residual of a plain card is rounding, and the residual of a
      // bonus card is THE SIZE OF THE BONUS IN PRINTED POINTS — which is the number worth knowing.
      const plain = rows.filter((c) => known(c).length === 0)
      const predict = fit(plain, target)
      const rmse = Math.sqrt(plain.reduce((s, c) => s + (c.p[target] - predict(c)) ** 2, 0) / plain.length)
      const res = rows.map((c) => ({ c, r: c.p[target] - predict(c), why: known(c) })).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
      const explained = res.filter((x) => x.why.length && Math.abs(x.r) >= 1)
      const bare = res.filter((x) => !x.why.length && Math.abs(x.r) >= 1)
      lines.push(
        `  ${label}  (n=${rows.length}, ${plain.length} plain; residual RMSE on the plain cards ${rmse.toFixed(2)} — ` +
          'the model reproduces the pipeline to rounding, so anything bigger is a named nonlinearity)',
      )
      lines.push(`  ${label} — EXPOSURE: ${explained.length} cards moved >= 1 point by a named term; the largest ${Math.min(HALF, explained.length)} below`)
      // These are the formula WORKING, and they are still the best hunting ground in the script: a
      // named term worth ten printed points is a term carrying a card, and a ruling about that card
      // is really a ruling about the term. Graded well below a genuine anomaly, never suppressed.
      for (const { c, r, why } of explained.slice(0, HALF)) {
        push({
          check: `4 ${label} (exposure)`,
          card: c.p.name,
          stage: 'ratings-to-off-def',
          severity: Math.min(60, Math.abs(r) * 5),
          reason: `${why.join(' + ')} is worth ${r > 0 ? '+' : ''}${r.toFixed(1)} printed points here`,
          values: { [target]: c.p[target] as number, without_term: Number(predict(c).toFixed(1)), term: Number(r.toFixed(1)) },
        })
      }
      emit(lines, `4 ${label} (exposure)`)
      lines.push(`  ${label} — UNEXPLAINED (>= 1 point off with no named term): ${bare.length} cards`)
      for (const { c, r } of bare.slice(0, HALF)) {
        push({
          check: `4 ${label}`,
          card: c.p.name,
          stage: 'ratings-to-off-def',
          severity: Math.min(100, Math.abs(r) * 12),
          reason: `${r > 0 ? 'prints ABOVE' : 'prints BELOW'} its sheet by ${Math.abs(r).toFixed(1)}, nothing named explains it`,
          values: {
            [target]: c.p[target] as number,
            predicted: Number(predict(c).toFixed(1)),
            residual: Number(r.toFixed(1)),
            sigma: Number((r / rmse).toFixed(1)),
          },
        })
      }
      emit(lines, `4 ${label}`)
    }
  }
  section(
    'CHECK 4 — class outliers: the cards the formula treats unusually',
    [
      '  A linear model of o_ovr / d_ovr on the sheet (plus the shapes o_score and d_score actually read: the',
      '  sorted zones, volume x efficiency, fouldraw x ft, the size modifier), fitted separately inside big and',
      '  perimeter, and fitted ONLY on cards no named nonlinearity touches. It then reproduces the pipeline to',
      '  0.3 of a point — rounding — so every residual above a point is one of six named terms and is reported',
      '  as EXPOSURE: the zone-dominance bonus (recal_37/43), the big hub (recal_55), the off-ball floor',
      '  (recal_64), the size modifier, the band above the 93 knee, the 99 clamp. THE EXPOSURE LIST IS THE',
      '  PRODUCT. A term worth ten printed points to a card is the term a ruling about that card would be about.',
      '  UNEXPLAINED is the regression alarm: it is empty today, and it stops being empty the moment a term is',
      '  added to compute_ovr.py without this script learning its name.',
    ].join(EOL),
    lines,
  )
}

// =============================================================================================
// CHECK 5 — anchor proximity
// =============================================================================================

if (wanted('5')) {
  const lines: string[] = []
  for (const [scale, key] of [['OFF', 'o_ovr'], ['DEF', 'd_ovr'], ['OVR', 'ovr']] as const) {
    const hist = new Map<number, Card[]>()
    for (const c of CARDS) {
      const v = c.p[key] as number
      const l = hist.get(v)
      if (l) l.push(c)
      else hist.set(v, [c])
    }
    const above = [...hist.entries()].filter(([v]) => v >= KNEE).sort((a, b) => b[0] - a[0])
    const ceiling = hist.get(99) ?? []
    const total = above.reduce((s, [, l]) => s + l.length, 0)
    lines.push(`  ${scale}: ${ceiling.length} on 99, ${total} at or above the ${KNEE} knee — ${above.map(([v, l]) => `${v}:${l.length}`).join(' ')}`)
    // A pile-up is only a problem once it is a CROWD. One card on the ceiling is a ceiling doing its
    // job; fifty is the anchor compressing the top, which is what recal_84 and recal_90 were about.
    push({
      check: `5 pile-up ${scale}`,
      card: `${scale} = 99`,
      stage: 'ratings-to-off-def',
      severity: Math.min(100, Math.max(0, ceiling.length - 3) * 4),
      reason: ceiling.length > 3 ? `${ceiling.length} cards share the ceiling; the scale cannot separate them` : `${ceiling.length} on the ceiling — no compression`,
      values: { at_99: ceiling.length, at_or_above_knee: total, next_value_down: above[1] ? above[1][1].length : 0 },
    })
    const worst = ceiling
      .filter((c) => c.rank.bpm !== null && !c.boxSuspect)
      .map((c) => ({ c, r: (c.rank.bpm as number) / c.n }))
      .sort((a, b) => b.r - a.r)
      .slice(0, 5)
    for (const { c, r } of worst) {
      push({
        check: `5 weakest on the ${scale} ceiling`,
        card: c.p.name,
        stage: 'ratings-to-off-def',
        severity: Math.min(100, r * 400),
        reason: `on the ${scale} ceiling, weakest of that group by season BPM rank`,
        values: { [key]: c.p[key] as number, bpm: c.b!.bpm, bpm_rank: Math.round(c.rank.bpm as number), season_n: c.n, tied_with: ceiling.length - 1 },
      })
    }
    emit(lines, `5 weakest on the ${scale} ceiling`)
  }
  const capped = CARDS.filter((c) => capOf(c.p).binds)
  const bigs = capped.filter((c) => c.p.big).length
  lines.push(
    `  OVR cap binds on ${capped.length} cards (${bigs} big at o_ovr+40, ${capped.length - bigs} perimeter at ` +
      'max(o_ovr+10, 0.85*d_ovr)) — for these OVR is a clamp, not a blend',
  )
  for (const c of capped.sort((a, b) => capOf(b.p).raw - capOf(b.p).cap - (capOf(a.p).raw - capOf(a.p).cap)).slice(0, 8)) {
    const { cap, raw } = capOf(c.p)
    push({
      check: '5 OVR cap binds',
      card: c.p.name,
      stage: 'ratings-to-off-def',
      severity: Math.min(100, (raw - cap) * 12),
      reason: `OVR set by the ${c.p.big ? 'big' : 'perimeter'} offence cap, ${(raw - cap).toFixed(1)} below the blend`,
      values: { ovr: c.p.ovr, o_ovr: c.p.o_ovr, d_ovr: c.p.d_ovr, blend: Number(raw.toFixed(1)), cap: Number(cap.toFixed(1)) },
    })
  }
  emit(lines, '5 OVR cap binds')
  section(
    'CHECK 5 — anchor proximity: the ceiling, the 93 knee, and the OVR cap',
    [
      '  A crowd on 99 means the band anchor is compressing the top: men the scale is meant to separate print',
      '  the same number. recal_84 and recal_90 were both this, and this section is how the next drift is seen',
      '  before it is felt. The per-card lines name the cards holding a ceiling their box line does not support,',
      '  and the cards whose OVR is decided by the cap rather than by the blend — the two places a score stops',
      '  being a reading and becomes a clamp.',
    ].join(EOL),
    lines,
  )
}

// =============================================================================================
// CHECK 6 — diff mode
// =============================================================================================

if (BASE) {
  const raw = execFileSync('git', ['show', `${BASE}:src/data/players_stats.json`], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const old = JSON.parse(raw) as Player[]
  const oldBy = new Map(old.map((p) => [p.name, p]))
  const lines: string[] = []
  const gone = old.filter((p) => !BY_NAME.has(p.name)).length
  const added = CARDS.filter((c) => !oldBy.has(c.p.name)).length
  lines.push(`  base ${BASE}: ${old.length} cards, ${added} added since, ${gone} removed`)
  lines.push('')

  for (const [scale, key] of [['OVR', 'ovr'], ['OFF', 'o_ovr'], ['DEF', 'd_ovr']] as const) {
    const deltas: { c: Card; d: number }[] = []
    for (const c of CARDS) {
      const o = oldBy.get(c.p.name)
      if (!o) continue
      const d = (c.p[key] as number) - (o[key] as number)
      if (d !== 0) deltas.push({ c, d })
    }
    const buckets = new Map<string, number>()
    for (const { d } of deltas) {
      const b = Math.abs(d) >= 10 ? '10+' : Math.abs(d) >= 5 ? '5-9' : Math.abs(d) >= 3 ? '3-4' : Math.abs(d) >= 2 ? '2' : '1'
      const k = `${d > 0 ? '+' : '-'}${b}`
      buckets.set(k, (buckets.get(k) ?? 0) + 1)
    }
    const mean = deltas.length ? deltas.reduce((s, x) => s + x.d, 0) / deltas.length : 0
    lines.push(
      `  ${scale}: ${deltas.length}/${CARDS.length} moved, mean signed delta ${mean.toFixed(2)} — ` +
        [...buckets.entries()].sort().map(([k, v]) => `${k}:${v}`).join(' '),
    )
    // Deltas are small integers, so |delta| alone leaves a twenty-five-way tie and the printed list
    // becomes whichever cards happen to sort first. The tie-break is the card's own height on the
    // board: a 99 dropping to 97 is the mover worth seeing, not the twentieth 64 that became a 62.
    deltas.sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || (b.c.p[key] as number) - (a.c.p[key] as number))
    for (const { c, d } of deltas.slice(0, TOP)) {
      const o = oldBy.get(c.p.name) as Player
      push({
        check: `6 mover ${scale}`,
        card: c.p.name,
        stage: 'ratings-to-off-def',
        severity: Math.min(100, Math.abs(d) * 7),
        reason: `${scale} ${d > 0 ? '+' : ''}${d} since ${BASE}`,
        values: { was: o[key] as number, now: c.p[key] as number, delta: d },
      })
    }
    emit(lines, `6 mover ${scale}`)
  }

  // Attribute movers, so an OFF/DEF move can be traced to the stage that actually caused it.
  {
    const attrKeys = Object.keys(CARDS[0].p.attrs).filter((k) => typeof (CARDS[0].p.attrs as unknown as Record<string, unknown>)[k] === 'number')
    const moved = new Map<string, number>()
    for (const c of CARDS) {
      const o = oldBy.get(c.p.name)
      if (!o) continue
      for (const k of attrKeys) {
        if ((c.p.attrs as unknown as Record<string, number>)[k] !== (o.attrs as unknown as Record<string, number>)[k]) {
          moved.set(k, (moved.get(k) ?? 0) + 1)
        }
      }
    }
    lines.push(
      moved.size === 0
        ? '  attributes: NOTHING moved — this was a compute_ovr-only stretch (ratings-to-off-def owns every delta above).'
        : `  attributes moved: ${[...moved.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`,
    )
    lines.push('')
  }

  // Rank flips inside the top 50 by OVR — the part of the board anyone actually looks at.
  {
    const rankOf = (list: { name: string; ovr: number }[]) => {
      const s = [...list].sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name))
      return new Map(s.map((p, i) => [p.name, i + 1]))
    }
    const rNow = rankOf(CARDS.map((c) => ({ name: c.p.name, ovr: c.p.ovr })))
    const rOld = rankOf(old.map((p) => ({ name: p.name, ovr: p.ovr })))
    const flips: { name: string; from: number; to: number }[] = []
    for (const [name, to] of rNow) {
      const from = rOld.get(name)
      if (from !== undefined && to !== from && (to <= 50 || from <= 50)) flips.push({ name, from, to })
    }
    flips.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    lines.push(`  rank flips touching the top 50 by OVR: ${flips.length}`)
    for (const f of flips.slice(0, TOP)) {
      push({
        check: '6 top-50 rank flip',
        card: f.name,
        stage: 'ratings-to-off-def',
        severity: Math.min(100, Math.abs(f.to - f.from) * 3),
        reason: `board rank ${f.from} -> ${f.to}`,
        values: { from: f.from, to: f.to, moved: f.to - f.from },
      })
    }
    emit(lines, '6 top-50 rank flip')
  }
  section(
    `CHECK 6 — collateral against ${BASE}`,
    [
      '  What the last regeneration actually did to the board. Read this FIRST after any round: a change that',
      '  reached its subject and moved four hundred other cards by 3 is a different round from one that moved',
      '  eleven. Rank flips are computed over the whole pool but reported only where they touch the top 50.',
    ].join(EOL),
    lines,
  )
}

// ---------------------------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------------------------

if (INTEGRITY.length) {
  for (const g of INTEGRITY) {
    push({
      check: '0 integrity',
      card: g.join(' = '),
      stage: 'pipeline',
      severity: 90,
      reason: 'two cards joined to ONE box-score row; the box evidence for both is unusable',
      values: { cards: g.length, season: (BY_NAME.get(g[0]) as Card).season },
    })
  }
}

if (AS_JSON) {
  console.log(JSON.stringify([...FLAGS].sort((a, b) => b.severity - a.severity), null, 1))
} else {
  console.log(
    [
      '',
      '='.repeat(112),
      `SCOUT — pipeline version ${PIPELINE.version}, ${CARDS.length} cards, ${SEASONS.size} seasons (${Math.min(...SEASONS.keys())}-${Math.max(...SEASONS.keys())})`,
      `box-score context: ${CARDS.filter((c) => c.b).length}/${CARDS.length} matched in src/data/stats.json` +
        (BASE ? `   |   diff base: ${BASE}` : ''),
      INTEGRITY.length
        ? `INTEGRITY: ${INTEGRITY.length} pairs of cards share ONE box-score row and are excluded from every box-based check — ` +
          INTEGRITY.map((g) => g.join(' = ')).join('; ')
        : 'INTEGRITY: every card has its own box-score row.',
      '='.repeat(112),
      'Every flag is a suspicion, not a verdict. Doctrine that is SUPPOSED to look strange (Jordan\'s out ~23, lob',
      'finishers in the 60s on paint, pre-97 inferred zones compressing superstars) appears here and must not be',
      '"fixed" — data/RATINGS_UPDATE.md, "Known, accepted properties".',
    ].join(EOL),
  )
  // The diff is the newest concern there is — what the last round just did. It leads when present.
  for (const s of BASE ? [SECTIONS[SECTIONS.length - 1], ...SECTIONS.slice(0, -1)] : SECTIONS) console.log(s)
  const top = [...FLAGS].sort((a, b) => b.severity - a.severity).slice(0, 6)
  console.log(
    `${EOL}${'='.repeat(112)}${EOL}${FLAGS.length} flags. Loudest: ${top.map((f) => `${f.card} (${f.check})`).join(', ')}.` +
      `${EOL}--json for the machine-readable list, --top N for longer lists, --base <ref> for the collateral report.${EOL}`,
  )
}
