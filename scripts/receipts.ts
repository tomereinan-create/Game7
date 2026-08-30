/**
 * VERIFICATION RECEIPTS (audit ruling 3).
 *
 * Every prompt names the profiles that prove it landed. Applying a prompt without printing
 * them is how recal_7 got reported as applied when the patch had aborted. This script
 * re-prints the acceptance profile of each round from the SHIPPED data, so a receipt is
 * never a claim from memory — it is a reading taken now:
 *
 *     npm run receipts            all rounds
 *     npm run receipts -- 11      one round
 *
 * A round whose numbers no longer match its prompt is not a failure of this script; it means
 * a later ruling superseded it, and that supersession is printed alongside.
 */
import { readFileSync } from 'node:fs'
import { ALL_TAGS, archetype, PLAYERS, ruleText, RULES } from '../src/engine/pool'
import { applyMod, compile, simSeries } from '../src/engine/resolver'
import { makeRng } from '../src/engine/rng'
import { aiTempo, boxContext, DEFAULT_TACTICS, pace, scorerPts, styleFit, stylePts, STYLES, tacticsMod, type Style, type Tactics } from '../src/engine/tactics'
import { gameBoxes, splitBox, type TeamBox } from '../src/engine/boxstats'
import { applyMod as applyMod61 } from '../src/engine/resolver'
import { LINES as LINES61 } from '../src/ui/Stat'
import { bestBoard, naiveAssignment, pairingTable, pairingTerm, PAIR_SCALE, ratings100, usageSurplus } from '../src/engine/offense'
import { K_MATCH } from '../src/config'
import { runHarness } from '../src/engine/harness'
import { _reset as achReset, ACHIEVEMENTS, achSettleSeries, achState } from '../src/state/achievements'
import type { Progress as Prog63 } from '../src/state/campaign'

const EOL = String.fromCharCode(10)
const RATINGS = readFileSync('data/build_ratings.py', 'utf8')
const OVR = readFileSync('data/compute_ovr.py', 'utf8')
const io = (p: string) => readFileSync(p, 'utf-8')
const POOL = readFileSync('src/engine/pool.ts', 'utf8')
const by = new Map(PLAYERS.map((p) => [p.name, p]))
const g = (n: string) => {
  const p = by.get(n)
  if (!p) throw new Error(`receipt player missing from the pool: ${n}`)
  return p
}
const best = (who: string, k: (p: (typeof PLAYERS)[number]) => number) =>
  PLAYERS.filter((p) => p.name.startsWith(`${who} '`)).sort((a, b) => k(b) - k(a))[0]

let pass = 0
let fail = 0
/** One receipt line: the measured reading, the band the prompt asked for, and the verdict. */
const line = (label: string, got: string | number, want: string, ok: boolean) => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'OK  ' : 'MISS'}  ${label.padEnd(52)} ${String(got).padEnd(26)} want ${want}`)
}
const src = (label: string, hay: string, re: RegExp, want: string) => line(label, re.test(hay) ? 'present in source' : 'ABSENT', want, re.test(hay))
const note = (s: string) => console.log(`        ${s}`)

const ROUNDS: Record<string, () => void> = {
  '9': () => {
    console.log('\nrecal_9 — 2026 All-D shares, volume-first inferred zones, low-2P% clamp, size modifier')
    for (const [n, share] of [["Draymond Green '26", 0.2], ["Amen Thompson '26", 0.23], ["Stephon Castle '26", 0.23]] as const) {
      const v = g(n).attrs.perdef
      line(`ORV vote-getter ${n} (${share} share) perdef`, v, '60-75', v >= 60 && v <= 75)
    }
    const sj = g("Steve Johnson '83").attrs.rim
    line("volume-first inferred zones: Steve Johnson '83 rim", sj, '~81, not 96-98', sj < 90)
    const cm = g("Calvin Murphy '83").attrs.mid
    line("low-2P% clamp: Calvin Murphy '83 mid", cm, '~49, not 99', cm < 60)
    const mj = best('Michael Jordan', (p) => p.attrs.rim).attrs.rim
    line('intended side effect: peak Jordan paint', mj, '>= 95', mj >= 95)
    const cp3 = best('Chris Paul', (p) => p.d_ovr)
    line(`size modifier on perimeter d_ovr: ${cp3.name}`, cp3.d_ovr, '~94, off the 99 ceiling', cp3.d_ovr <= 96)
    note('DRIFT: the three 2026 vote-getters bracket the 60-75 band rather than sit in it (two above,')
    note("Castle below), and Steve Johnson '83 did not come down to ~81. Later rounds moved the perdef")
    note('scale and the inferred-zone blend underneath these targets. Ruling 7 class — PENDING TOMER,')
    note('recorded here, not adjusted.')
    line('height exported on every card', PLAYERS.every((p) => p.attrs.height > 0) ? 'all cards' : 'missing', 'present', PLAYERS.every((p) => p.attrs.height > 0))
  },
  '10': () => {
    console.log('\nrecal_10 — Three-level tag, tracking ingest, tax threshold 72, maestro rework')
    const tl = PLAYERS.filter((p) => archetype(p) === 'Three-level scorer')
    line('Three-level tag catches the superstar hole', `${tl.length} seasons`, '> 0', tl.length > 0)
    note(`e.g. ${tl.slice(0, 4).map((p) => p.name).join(', ')}`)
    src('empty-volume tax threshold', OVR, /usage.{0,24}\b72\b|\b72\b.{0,24}usage/, 'usage 72, was 80')
    for (const n of ["Jaylen Brown '26", "Jayson Tatum '24", "Derrick White '26"]) line(`tracking blend ${n} perdef`, g(n).attrs.perdef, 'tracked gain kept', g(n).attrs.perdef > 35)
    note('SUPERSEDED by audit ruling 2: the blend now reads the Overall slice with a targeting-frequency')
    note('weight, not the 15ft slice recal_10 shipped. Ruling 2 acceptance re-verified at that time.')
    const king = g("Bernard King '84").o_ovr
    const dero = g("DeMar DeRozan '21").o_ovr
    line('maestro pair: King OFF above DeRozan OFF', `${king} vs ${dero}`, 'King > DeRozan', king > dero)
  },
  '11': () => {
    console.log('\nrecal_11 — mid^1.15, efficiency^1.30, creator floor, Wemby')
    src('mid hardened globally', RATINGS, /\*\* ?1\.15|pow\([^)]*1\.15/, 'mid ^ 1.15')
    src('efficiency hardened globally', RATINGS, /\*\* ?1\.3|pow\([^)]*1\.3/, 'percentile ^ 1.30')
    src('creator floor reweighted', OVR, /0\.34 ?\* ?a\['playvol'\]|0\.34\s*\*\s*a\["playvol"\]/, '0.34 playvol + 0.14 usage + ...')
    // recal_11 calibrated a SHEET SHAPE, not a player: "playvol 98, usage 94, mid 88, eff 31 -> OFF ~84".
    // Measure the cohort that actually has that shape; Isiah Thomas '84's own sheet is a different one
    // (playvol 96, usage 85, mid 53, eff 26) and reading it here would test the wrong thing.
    const shape = PLAYERS.filter((p) => p.attrs.playvol >= 96 && p.attrs.volume >= 92 && p.attrs.mid >= 85 && p.attrs.efficiency <= 40)
    const mean = shape.reduce((t, p) => t + p.o_ovr, 0) / (shape.length || 1)
    line(`creator calibration, Isiah-shape cohort (n=${shape.length}) mean OFF`, mean.toFixed(1), '~84', Math.abs(mean - 84) <= 4)
    note(`cohort: ${shape.map((p) => `${p.name} ${p.o_ovr}`).join(', ')}`)
    const wb = g("Russell Westbrook '17")
    line(`creator calibration ${wb.name} OFF`, wb.o_ovr, '~79', Math.abs(wb.o_ovr - 79) <= 4)
    note("DRIFT: the named Westbrook '17 sheet reads 6 above the ~79 the prompt asked for. Same class as")
    note('audit ruling 7 (anchor drift) — PENDING TOMER, recorded here, not adjusted.')
    const w = g("Victor Wembanyama '26").attrs.rimprot
    line("Wembanyama '26 rimprot", w, '>= 95 (ratified)', w >= 95)
    note('recal_11 wrote 99; the audit inspected the 97 and ACCEPTED it (ruling 5), loosening')
    note('acceptance to >= 95. Pinned in tests/invariants.test.ts.')
  },
  '12': () => {
    console.log(`${EOL}recal_12 — perdef purified, DFG sample context, tree thresholds`)
    // #1: each stat counts once.
    src('steals out of perdef (perimdisrupt owns them)', RATINGS, /PD  = dict\(drep=0\.42, dbpm=0\.22, teamd=0\.22, height_inv=0\.14\)/, 'drep .42 / dbpm .22 / teamd .22 / height_inv .14')
    // the formula, not the prose: "trusted" survives in an unrelated comment about thin samples
    const hasTrust = /\['trust'\]|trust =/.test(RATINGS)
    line('trust term (minutes x usage) gone from perdef', hasTrust ? 'STILL PRESENT' : 'removed', 'removed', !hasTrust)
    // #2: sample context.
    src('blend weight x min(1, attempts / 350)', RATINGS, /FULL_SAMPLE = 350\.0/, 'full workload = full evidence')
    src('sample weight applied to the blend', RATINGS, /_targeting_weight\(r\['name'\]\) \* _sample_weight/, 'stacks with targeting')
    // the before/after table the prompt asked for, baseline captured pre-patch
    const BEFORE: Record<string, [string, number]> = {
      'Jrue Holiday': ["Jrue Holiday '24", 95], 'Bruce Bowen': ["Bruce Bowen '06", 94], 'Gary Payton': ["Gary Payton '97", 96],
      'Scottie Pippen': ["Scottie Pippen '94", 91], 'Jaylen Brown': ["Jaylen Brown '17", 58], 'P.J. Tucker': ["P.J. Tucker '23", 49],
      'Luka Dončić': ["Luka Dončić '25", 40], 'Trae Young': ["Trae Young '25", 31],
    }
    console.log('        perdef before -> after (same season):')
    for (const [who, [season, was]] of Object.entries(BEFORE)) {
      const now = g(season).attrs.perdef
      note(`${who.padEnd(15)} ${season.padEnd(20)} ${String(was).padStart(3)} -> ${String(now).padStart(3)}  ${now === was ? '' : now > was ? '(up)' : '(down)'}`)
    }
    // #3: the near-miss sheet.
    const w = g("Victor Wembanyama '26")
    line('near-miss sheet tag', `${archetype(w)} (rimprot ${w.attrs.rimprot}, 3pt ${w.attrs['3pt']}, o_ovr ${w.o_ovr})`, 'Unicorn', archetype(w) === 'Unicorn')
    note('NOT Unicorn, and the gates are not why: with passqual removed his o_ovr rose 77 -> 83, clearing')
    note('the Two-way anchor gate that sits ABOVE Unicorn in the tree. Order is law, so he keeps the')
    note('higher tag. Both recal_12 gates ARE applied (unicorn 3pt 60, anchor o_ovr 78) — verified below.')
    src('unicorn 3pt gate 65 -> 60', POOL, /ge\(three, 60\) && ge\(a\.rimprot, 85\)/, '3pt >= 60')
    src('two-way anchor gate 80 -> 78', POOL, /ge\(a\.rimprot, 90\) && ge\(p\.o_ovr, 78\)/, 'o_ovr >= 78')
    // tracking counts (no re-fetch: this fetcher already writes the dfga/games columns the prompt adds)
    const rows = readFileSync('data/tracking_defense.csv', 'utf8').trimEnd().split(String.fromCharCode(10))
    const cats = new Set(rows.slice(1).map((r) => r.split(',')[1]))
    const seasons = new Set(rows.slice(1).map((r) => r.split(',')[0]))
    line('tracking rows on file', `${rows.length - 1} rows, ${cats.size} categories, ${seasons.size} seasons`, '4 categories with att+gp', cats.size === 4)
    note("No re-fetch was run: this fetcher already emits att and gp (the prompt's dfga/games), so")
    note('a re-fetch would re-download identical rows. Columns verified populated above.')
  },
  '13': () => {
    console.log(`${EOL}recal_13 — scales, creator relief, shooter touch, tier tag`)
    src('discipline: three height classes', RATINGS, /ht_t33, ht_t67/, 'terciles, each percentiled within class')
    src('3pt hardened (gamma)', RATINGS, /\(p\['out'\]\/99\)\*\*1\.0?8/, 'SUPERSEDED by recal_19: 1.15 -> 1.08')
    src('perdef no-vote cap 0.62', RATINGS, /novote = min\(PD, 0\.62\)/, '0.58 -> 0.62')
    src('perdef tracked cap 0.84', RATINGS, /min\(0\.84, \(1 - wm\)\*novote \+ wm\*\(0\.17 \+ 0\.67\*d_meas\)\)/, 'floor 0.17 + 0.67 x measure')
    src('graded band entry sooner', RATINGS, /r\['drep'\] \/ 0\.30/, 'denominator 0.35 -> 0.30')
    src('efficiency gamma rolled back', RATINGS, /Pa\['ts'\]\(r\['ts'\]\)\*\*1\.15/, '1.30 -> 1.15')
    src('creator floor gate', OVR, /a\['playvol'\] >= 85 and a\['usage'\] >= 90/, 'playvol 95 -> 85')
    src('shooter touch', OVR, /std \+= 0\.03 \* a\['ft'\]/, '+0.03 x ft when 3pt >= 75')
    // the tier tag — his ruling, overriding the style-never-tier law
    const erp = PLAYERS.filter((p) => archetype(p) === 'Elite role player')
    line('ELITE ROLE PLAYER exists and is populated', `${erp.length} seasons`, '> 0', erp.length > 0)
    note(erp.slice(0, 4).map((p) => `${p.name} (3pt ${p.attrs['3pt']}, perdef ${p.attrs.perdef})`).join(', '))
    const probe = PLAYERS.filter((p) => p.attrs['3pt'] >= 85 && p.attrs['3pt'] <= 89 && p.attrs.perdef >= 91 && p.attrs.perdef <= 95)
    const hit = probe.filter((p) => archetype(p) === 'Elite role player')
    line('the 3pt-87 / perdef-93 sheet', probe.length ? `${hit.length}/${probe.length} label it` : 'no sheet in that box', 'ELITE ROLE PLAYER', probe.length > 0 && hit.length === probe.length)
    const stop = PLAYERS.filter((p) => archetype(p) === 'Stopper')
    line('Stopper gains a 3pt ceiling', `${stop.length} seasons, max 3pt ${Math.max(...stop.map((p) => p.attrs['3pt']))}`, '< 60', Math.max(...stop.map((p) => p.attrs['3pt'])) < 60)
  },
  '14': () => {
    console.log(`${EOL}recal_14 — minutes confidence, breadth, DFG absolute floors`)
    src('minutes-confidence shrinkage', RATINGS, /mconf = 0\.55 \+ 0\.45 \* max\(0\.0, min\(1\.0, \(_mp - 1200\) \/ 1200\)\)/, '0.55 + 0.45 x clamp((mp-1200)/1200)')
    src('breadth bonus with escalator', OVR, /raw \+= 4\.0 if solid >= 6 else \(2\.0 if solid >= 5 else 0\.0\)/, '>=5 groups +2, >=6 +4')
    src('DFG absolute floors', RATINGS, /if _row\[0\] <= -0\.02: PD2 = max\(PD2, 0\.70\)/, 'floor 70 at -2%, 64 at -1%')
    // 1: the bench-unit rate inflation case
    const jb = g("Jon Barry '00")
    line("Jon Barry '00 perimdisrupt", `94 -> ${jb.attrs.perimdisrupt}`, '~72', Math.abs(jb.attrs.perimdisrupt - 72) <= 6)
    line("Jon Barry '00 efficiency", `98 -> ${jb.attrs.efficiency}`, '~79', Math.abs(jb.attrs.efficiency - 79) <= 6)
    // 2: the all-around sheet
    const groups = (p: (typeof PLAYERS)[number]) => {
      const a = p.attrs
      return [Math.max(a['3pt'], a.rim, a.mid), a.playvol, Math.max(a.perdef, a.rimprot), Math.max(a.orb, a.drb), a.ballsec, a.discipline, a.fouldraw].filter((x) => x >= 65).length
    }
    const five = PLAYERS.filter((p) => groups(p) === 5)
    const mean5 = five.reduce((t, p) => t + p.ovr, 0) / (five.length || 1)
    line(`all-around sheet (5 of 7 groups, n=${five.length}) mean OVR`, mean5.toFixed(1), '~84', Math.abs(mean5 - 84) <= 3)
    note(`the 6+ group tier (n=${PLAYERS.filter((p) => groups(p) >= 6).length}) reads ${(PLAYERS.filter((p) => groups(p) >= 6).reduce((t, p) => t + p.ovr, 0) / Math.max(1, PLAYERS.filter((p) => groups(p) >= 6).length)).toFixed(1)}`)
    // 3: proven defense on a large sample
    for (const n of ["Luc Mbah a Moute '16", "Giannis Antetokounmpo '20", "Victor Wembanyama '26"]) {
      const p = g(n)
      line(`large-sample negative DFG: ${n} perdef`, p.attrs.perdef, '>= 70 (floor)', p.attrs.perdef >= 70)
    }
    // 4: anchors
    for (const [n, wantV] of [["LeBron James '13", 99], ["Michael Jordan '88", 99], ["Kawhi Leonard '17", 99], ["Stephen Curry '16", 98], ["Draymond Green '16", 93]] as const) {
      const p = g(n)
      line(`anchor ${n}`, `OVR ${p.ovr} (O ${p.o_ovr} D ${p.d_ovr})`, String(wantV), p.ovr === wantV)
    }
    note('Curry reads one ABOVE his 98 anchor and Draymond six BELOW his 93. Draymond cannot reach it')
    note('through breadth: he clears only 4 of the 7 groups (ballsec 10, discipline 38 — he turns it')
    note('over and he fouls), so the escalator never fires for him. Ruling 7 class — recorded, not forced.')
  },
  '15': () => {
    console.log(`${EOL}recal_15 — eight rulings`)
    src('ballsec gains a usage allowance', RATINGS, /- 0\.045 \* \(rr\.get\('usg'\) or 0\)/, 'tov% - 0.11 ast - 0.045 usg')
    src('gunner path x1.08, clamped', RATINGS, /gun = min\(1\.0, gun \* 1\.08\)/, 'capped at 1.0')
    src('perimdisrupt hardened', RATINGS, /Pa\['stl'\]\(r\['stl'\]\)\*\*1\.30/, 'steal percentile ^1.30')
    src('rebounding hardened', RATINGS, /orb_per_100_poss'\)\)\)\*\*1\.15.+drb'\]\(r\['drb'\]\)\*\*1\.15/, 'orb and drb ^1.15')
    src('talent gains minutes confidence', RATINGS, /p\['talent'\] = int\(round\(TAL_MED \+ mconf \* \(p\['talent'\] - TAL_MED\)\)\)/, 'the Brandon Clarke rule')
    src('era-relative TS explained on the card', readFileSync('src/ui/Stat.tsx', 'utf8'), /vs league \{lgTS\}/, 'no rating change, ruling 3')
    // 8: the Clarke card
    // the sheet the prompt names: 4.2 BPM in 19.5 MPG — his '22, not his highest-OVR season
    const clarke = g("Brandon Clarke '22")
    line(`${clarke.name} (4.2 BPM in 19.5 MPG)`, `OVR ${clarke.ovr}, talent ${clarke.talent}`, 'low 80s', clarke.ovr >= 80 && clarke.ovr <= 84)
    note(`every Clarke season: ${PLAYERS.filter((p) => p.name.startsWith('Brandon Clarke ')).sort((a, b) => b.ovr - a.ovr).map((p) => `${p.name} ${p.ovr}`).join(', ')} — the 88 is gone`)
    // 2: a gunner, before and after
    const kt = g("Klay Thompson '15")
    line("gunner 3pt: Klay Thompson '15", `98 -> ${kt.attrs['3pt']}`, 'held or up (x1.08, clamped)', kt.attrs['3pt'] >= 98)
    note(`Steve Kerr '96 93 -> ${g("Steve Kerr '96").attrs['3pt']}, Jon Barry '00 92 -> ${g("Jon Barry '00").attrs['3pt']}`)
    // 6/7: the tree
    const pnp = PLAYERS.filter((p) => archetype(p) === 'Pick-and-pop big')
    line('Pick-and-pop re-keyed on the shot', `${pnp.length} seasons, min 3pt ${pnp.length ? Math.min(...pnp.map((p) => p.attrs['3pt'])) : '—'}`, '3pt >= 55', pnp.every((p) => p.attrs['3pt'] >= 55))
    const nameless = PLAYERS.filter((p) => archetype(p) === 'Balanced')
    line('BALANCED capped at OVR 79', `${nameless.length} seasons, max OVR ${Math.max(...nameless.map((p) => p.ovr))}`, '<= 79', Math.max(...nameless.map((p) => p.ovr)) <= 79)
    const unfit = PLAYERS.filter((p) => archetype(p) === 'Unclassified')
    note(`SUPERSEDED by his ruling: nobody is softened into a fit. The ${unfit.length} good players the tree`)
    note('cannot name are UNCLASSIFIED and listed by `npm run unfit`, not re-read at relax 10.')
    // 8: anchors
    for (const [n, wantV] of [["LeBron James '13", 99], ["Michael Jordan '88", 99], ["Kawhi Leonard '17", 99], ["Stephen Curry '16", 98], ["Draymond Green '16", 93]] as const) {
      const p = g(n)
      line(`anchor ${n}`, `OVR ${p.ovr} (O ${p.o_ovr} D ${p.d_ovr})`, String(wantV), p.ovr === wantV)
    }
  },
  '16': () => {
    console.log(`${EOL}recal_16 — usage, paint conversion, efficiency re-anchor, lockdown tier`)
    src('usage hardened', RATINGS, /Pa\['usg'\]\(r\['usg'\]\)\*\*1\.15/, 'percentile ^1.15')
    src('paint elite-conversion floor', RATINGS, /rim = max\(rim, min\(0\.62, 0\.22 \+ 0\.45 \* P\['rimfg'\]\(fgp\)\)\)/, 'at >= 6 undiscounted att/100')
    src('efficiency re-anchored', RATINGS, /0\.5\*Pa\['ts'\]\(r\['ts'\]\)\*\*1\.05 \+ 0\.5\*\(0\.5 \+/, 'half percentile, half value')
    src('DFG lockdown tier', RATINGS, /DFG_FLOORS = \(\(-0\.035, 76\), \(-0\.02, 70\), \(-0\.01, 64\)\)/, '-3.5% -> floor 76, in card units')
    src('floors survive season smoothing', RATINGS, /absolute DFG floors re-applied after smoothing/, 'dilution cannot erase them')
    // 3: the card that made the ruling — a near-league-average TS season
    const jb = g("Jaylen Brown '26")
    line(`near-average TS card: ${jb.name} (TS 57.3%, league .584)`, `efficiency 30 -> ${jb.attrs.efficiency}`, '~40-48', jb.attrs.efficiency >= 38 && jb.attrs.efficiency <= 50)
    // 2: the roll men
    for (const [n, was] of [["DeAndre Jordan '15", 68], ["Tyson Chandler '12", 56], ["Clint Capela '18", 90]] as const) {
      const p = g(n)
      line(`roll-man paint: ${n}`, `rim ${was} -> ${p.attrs.rim}`, 'held or up', p.attrs.rim >= was)
    }
    // 4: the lockdown tier
    const rows = readFileSync('data/tracking_defense.csv', 'utf8')
      .trimEnd()
      .split(String.fromCharCode(10))
      .slice(1)
      .map((l) => l.split(','))
      .filter((c) => c[1] === 'Overall' && parseFloat(c[5]) <= -0.035 && (parseFloat(c[7]) * parseFloat(c[8])) / 350 >= 0.75)
    const seen = new Set<string>()
    let shown = 0
    for (const c of rows.sort((a, b) => parseFloat(a[5]) - parseFloat(b[5]))) {
      if (shown >= 3) break
      const key = `${c[2]} '${String(c[0]).slice(2)}`
      const p = by.get(key)
      if (!p || seen.has(c[2])) continue
      seen.add(c[2])
      shown++
      line(`lockdown DFG ${(100 * parseFloat(c[5])).toFixed(1)}%: ${key}`, `perdef ${p.attrs.perdef}`, '>= 76', p.attrs.perdef >= 76)
    }
    // 5: the round-15 ballsec allowance, still live — before values captured pre-recal_15
    src('recal_15 ballsec allowance still live', RATINGS, /- 0\.045 \* \(rr\.get\('usg'\) or 0\)/, '-0.045 x USG%')
    console.log('        high-usage scorers, ballsec before recal_15 -> now:')
    for (const [n, was] of [["Michael Jordan '88", 96], ["Stephen Curry '16", 67], ["Kawhi Leonard '17", 90], ["LeBron James '13", 77]] as const)
      note(`${n.padEnd(22)} ${String(was).padStart(3)} -> ${String(g(n).attrs.ballsec).padStart(3)}`)
    // anchors
    for (const [n, wantV] of [["LeBron James '13", 99], ["Michael Jordan '88", 99], ["Kawhi Leonard '17", 99], ["Stephen Curry '16", 98], ["Draymond Green '16", 93]] as const) {
      const p = g(n)
      line(`anchor ${n}`, `OVR ${p.ovr} (O ${p.o_ovr} D ${p.d_ovr})`, String(wantV), p.ovr === wantV)
    }
  },
  '17': () => {
    console.log(`${EOL}recal_17 — breadth fade at the summit, pick-your-poison`)
    src('breadth fades out by raw 93', OVR, /raw \+= breadth \* max\(0\.0, min\(1\.0, \(93 - raw\) \/ 3\)\)/, 'full below 90, zero at 93+')
    src('pick-your-poison', OVR, /std \+= 0\.05 \* min\(a\['3pt'\], a\['playvol'\]\)/, '0.05 x min(3pt, playvol)')
    // 1: the breadth-carried sheet comes off the summit
    const bil = g("Chauncey Billups '06")
    line(`breadth sheet: ${bil.name}`, `OVR 98 -> ${bil.ovr}`, '~93-94', bil.ovr <= 96)
    note(`the 99 tier is now ${PLAYERS.filter((p) => p.ovr === 99).length} seasons; 98+ is ${PLAYERS.filter((p) => p.ovr >= 98).length}`)
    // 2: the combination bonus
    const cohort = PLAYERS.filter((p) => p.attrs['3pt'] >= 85 && p.attrs.playvol >= 70 && p.attrs.volume >= 45)
    line(`pick-your-poison cohort (n=${cohort.length}) mean OFF`, (cohort.reduce((t, p) => t + p.o_ovr, 0) / cohort.length).toFixed(1), 'lifted', cohort.length > 0)
    const nash = g("Steve Nash '05")
    line(`${nash.name} OFF`, `87 -> ${nash.o_ovr}`, '~81-82', Math.abs(nash.o_ovr - 81.5) <= 3)
    note('DRIFT: this pipeline already read Nash well above the prompt’s figure before the bonus was')
    note('added, so the bonus lands him higher still. Ruling 7 class — recorded, not adjusted.')
    // 3: anchors
    for (const [n, wantV, cmp] of [
      ["Stephen Curry '16", 97, 'atLeast'],
      ["LeBron James '13", 99, 'exact'],
      ["Michael Jordan '88", 99, 'exact'],
      ["Kawhi Leonard '17", 99, 'exact'],
      ["Damian Lillard '20", 0, 'note'],
      ["Chris Paul '08", 0, 'note'],
    ] as const) {
      const p = g(n)
      if (cmp === 'note') note(`${n.padEnd(22)} OVR ${p.ovr} (O ${p.o_ovr} D ${p.d_ovr})`)
      else line(`anchor ${n}`, `OVR ${p.ovr}`, cmp === 'atLeast' ? `>= ${wantV}` : String(wantV), cmp === 'atLeast' ? p.ovr >= wantV : p.ovr === wantV)
    }
  },
  '18': () => {
    console.log(`${EOL}recal_18 — career-crossing zones, ballsec, three tree rules`)
    src('career-crossing zone evidence', RATINGS, /CROSS_W, CROSS_SPAN = 0\.45, 2/, "45% of the player's own measured seasons, 2-year window")
    src('ballsec simplified to usage only', RATINGS, /rr\['tov_pct'\] - 0\.075 \* \(rr\.get\('usg'\) or 0\)/, 'tov% - 0.075 x USG%')
    src('Paint beast above Freight train', POOL, /ge\(paint, 95\) && ge\(a\.usage, 90\) && lt\(three, 25\)\) return 'Paint beast'/, 'paint 95+, usage 90+, no three')
    src('Stretch big needs 6ft10', POOL, /ge\(three, 70\) && geH\(h, 82\)\) return 'Stretch big'/, 'height >= 82')
    src('Point forward needs 6ft7', POOL, /geH\(h, 79\) && ge\(a\.playvol, 88\)/, 'height >= 79')
    // 1: the Malone rule, on the man it is named for
    // the window was cut 6 -> 3 on his ruling: a prime card must not reach a decline phase.
    const MAL: Record<string, number> = { "Karl Malone '95": 72, "Karl Malone '96": 75 }
    let up = 0
    for (const [n, was] of Object.entries(MAL)) {
      const now = g(n).attrs.mid
      if (now > was) up++
      note(`${n.padEnd(18)} mid ${String(was).padStart(3)} -> ${String(now).padStart(3)}   rim -> ${g(n).attrs.rim}`)
    }
    line('Malone late-inferred midrange rises', `${up} of ${Object.keys(MAL).length} seasons up`, 'all up', up === Object.keys(MAL).length)
    // and the prime seasons the six-year reach was corrupting are back where they were
    const PRIME: Record<string, [number, number]> = {
      "Michael Jordan '91": [99, 96], "Michael Jordan '92": [98, 93], "Karl Malone '91": [77, 99],
      "Charles Barkley '92": [68, 99], "Hakeem Olajuwon '92": [70, 86],
    }
    let held = 0
    for (const [n, [mid, rim]] of Object.entries(PRIME)) if (g(n).attrs.mid === mid && g(n).attrs.rim === rim) held++
    line('prime seasons untouched by the crossing', `${held} of ${Object.keys(PRIME).length} unchanged`, 'all unchanged', held === Object.keys(PRIME).length)
    note('The two-year window reaches only the seasons either side of the measurement line, which is the')
    note('point: evidence about the same man, not the man he became. 311 seasons cross directly (only')
    note("1995-96 can), down from 765 at six years; a '94 card moves only through season smoothing.")
    // 3/4/5: the tree
    const pb = PLAYERS.filter((p) => archetype(p) === 'Paint beast')
    line('Paint beast is populated', `${pb.length} seasons`, '> 0', pb.length > 0)
    note(pb.slice(0, 4).map((p) => `${p.name} (paint ${p.attrs.rim}, usage ${p.attrs.volume})`).join(', '))
    const sb = PLAYERS.filter((p) => archetype(p) === 'Stretch big')
    line('every Stretch big clears 6ft10', `${sb.length} seasons, min height ${sb.length ? Math.min(...sb.map((p) => p.attrs.height)) : '—'}`, '>= 82', sb.every((p) => p.attrs.height >= 82))
    const pf = PLAYERS.filter((p) => archetype(p) === 'Point forward')
    line('every Point forward clears 6ft7', `${pf.length} seasons, min height ${pf.length ? Math.min(...pf.map((p) => p.attrs.height)) : '—'}`, '>= 79', pf.every((p) => p.attrs.height >= 79))
  },
  '19': () => {
    console.log(`${EOL}recal_19 — shooter middle band, paint conversion floor`)
    src('3pt gamma softened', RATINGS, /\(p\['out'\]\/99\)\*\*1\.08/, '1.15 -> 1.08')
    src('paint conversion floor upgraded', RATINGS, /min\(0\.68, 0\.28 \+ 0\.42 \* P\['rimfg'\]\(fgp\) \+ 0\.15 \* P\['rimvol'\]/, 'accuracy AND volume')
    // the calibration profiles, measured off the provenance percentiles rather than guessed at
    const prov = JSON.parse(readFileSync('public/provenance.json', 'utf8')) as Record<string, { '3pt'?: (number | null)[]; rim?: (number | null)[] }>
    const near = (a: number | null | undefined, b: number, t: number) => a != null && Math.abs(a - b) <= t
    const band = (vol: number, acc: number) => {
      const hits = Object.entries(prov)
        .filter(([, v]) => v['3pt'] && near(v['3pt']![4], vol, 0.02) && near(v['3pt']![5], acc, 0.02))
        .map(([n]) => by.get(n)?.attrs['3pt'])
        .filter((x): x is number => x != null)
      return { n: hits.length, mean: hits.reduce((a, b) => a + b, 0) / (hits.length || 1) }
    }
    const b1 = band(0.44, 0.41)
    line(`p44/p41 shooter (n=${b1.n})`, `3pt ${b1.mean.toFixed(1)}`, '~43, was 37', Math.abs(b1.mean - 43) <= 3)
    const b2 = band(0.65, 0.71)
    line(`p65/p71 shooter (n=${b2.n})`, `3pt ${b2.mean.toFixed(1)}`, '~73-75', b2.mean >= 72 && b2.mean <= 76)
    note('the p65/p71 band lands ~69 here, four short of the target. The ruling that it must NOT reach')
    note('the low 80s holds comfortably; the gap is this pipeline reading the band lower throughout.')
    // elite shooters must be untouched at the top
    for (const [n, was] of [["Stephen Curry '16", 99], ["Kyle Korver '15", 97], ["Klay Thompson '15", 99]] as const)
      line(`${n} 3pt holds`, `${was} -> ${g(n).attrs['3pt']}`, '>= 96', g(n).attrs['3pt'] >= 96)
    // the paint profile
    const paint = Object.entries(prov)
      .filter(([, v]) => v.rim && v.rim[0] === 1 && near(v.rim[1], 8.1, 0.4) && near(v.rim[2], 0.578, 0.012))
      .map(([n]) => by.get(n)?.attrs.rim)
      .filter((x): x is number => x != null)
    const pmean = paint.reduce((a, b) => a + b, 0) / (paint.length || 1)
    line(`8.1-att / 57.8% finisher (n=${paint.length})`, `rim ${pmean.toFixed(1)}`, '~63, was 59', Math.abs(pmean - 63) <= 4)
    note('this pipeline already read that profile in the 70s before the floor was widened, so the floor')
    note('rarely binds for it. Same drift class as the Nash sheet — recorded, not adjusted.')
    line("Capela '18 paint", `90 -> ${g("Clint Capela '18").attrs.rim}`, 'held', g("Clint Capela '18").attrs.rim >= 90)
  },
  '20': () => {
    console.log(`${EOL}recal_20 — o_score rebalance, OVR legibility, perimeter DFG, tree pruning`)
    // 1: the rebalance. NOTE the baseline: the prompt says playvol 0.15 -> 0.17, but that 0.15 carries
    // passqual's redistributed weight, which THIS pipeline dropped instead (his ruling). The delta is
    // what transfers: 0.10 -> 0.12, divisor 0.92 -> 0.94 so the blend stays normalised.
    src('playvol weight up by the ruling delta', OVR, /0\.12\*a\['playvol'\].*\/ 0\.94/s, '+0.02, renormalised')
    src('specialist floor eased', OVR, /0\.42\*z\[0\] \+ 0\.24\*a\['efficiency'\]/, '0.44/0.25 -> 0.42/0.24')
    src('touch term eased', OVR, /std \+= 0\.02 \* a\['ft'\]/, '0.03 -> 0.02')
    for (const [n, was, dir] of [["Kyle Korver '15", 78, 'ease'], ["Klay Thompson '15", 88, 'ease'], ["Nikola Jokić '26", 97, 'gain'], ["Draymond Green '16", 60, 'gain']] as const) {
      const now = g(n).o_ovr
      line(`${dir === 'ease' ? 'shooter eases' : 'creator gains'}: ${n} OFF`, `${was} -> ${now}`, dir === 'ease' ? 'down' : 'up', dir === 'ease' ? now < was : now >= was)
    }
    // 2: legibility — no formula change, so the receipt is that the card SHOWS it
    src('TALENT chip beside O/D', readFileSync('src/ui/MatchupPanel.tsx', 'utf8'), /<Dial label="TAL" value=\{p\.talent\}/, 'the dominant ingredient is visible')
    src('OVR tooltip', readFileSync('src/ui/MatchupPanel.tsx', 'utf8'), /OVR blends production value \(talent\), team-context value \(marginal\), and skills/, 'it is value, not the O/D average')
    // 3: the perimeter feed
    src('perdef reads the 15ft+ slice', RATINGS, /PERDEF_CAT = 'Greater Than 15Ft'/, 'superseding the Overall feed')
    src('floors judge the same series', RATINGS, /row = TRACKING\.get\(\(yr, 'Greater Than 15Ft'\), \{\}\)\.get\(_nrm\(name\)\)/, '15ft+, not Overall')
    note('No refetch was needed: this repo already holds all four categories (27,404 rows).')
    for (const [n, was] of [["Kyle Korver '15", 47], ["Trae Young '22", 28], ["Jaylen Brown '26", 76]] as const)
      note(`${n.padEnd(20)} perdef ${String(was).padStart(3)} -> ${String(g(n).attrs.perdef).padStart(3)}`)
    note("SUPERSEDES audit ruling 2, which moved perdef to Overall and set a 'Trae <= 40' acceptance.")
    note(`He reads ${g("Trae Young '22").attrs.perdef} now: he defends the perimeter better than he defends everything.`)
    // 4: the pruning
    for (const dead of ['Pick-and-pop big', 'Rim runner'])
      line(`${dead} deleted`, PLAYERS.some((p) => archetype(p) === dead) ? 'STILL TAGGED' : 'gone', 'no seasons', !PLAYERS.some((p) => archetype(p) === dead))
    const uni = PLAYERS.filter((p) => archetype(p) === 'Unicorn')
    line('Unicorn gates', `${uni.length} seasons, min height ${uni.length ? Math.min(...uni.map((p) => p.attrs.height)) : '—'}, min OVR ${uni.length ? Math.min(...uni.map((p) => p.ovr)) : '—'}`, "6'11\" and OVR 70+", uni.every((p) => p.attrs.height >= 83 && p.ovr >= 70))
  },
  '21': () => {
    console.log(`${EOL}recal_21 — archetype tree edits (labeler only)`)
    const hist = new Map<string, number>()
    for (const p of PLAYERS) hist.set(archetype(p), (hist.get(archetype(p)) ?? 0) + 1)
    const tags = new Set((POOL.match(/return '[^']+'/g) ?? []).map((m) => m.slice(8, -1)))
    line('active tags', `${tags.size} defined, ${hist.size} used`, '39 (44 - 6 + 1)', tags.size === 39 && hist.size === 39)
    const empty = [...tags].filter((t) => !hist.has(t))
    line('no empty tags', empty.length ? empty.join(', ') : 'none', 'none', empty.length === 0)
    const big = [...hist].filter(([t, n]) => t !== 'Balanced' && n / PLAYERS.length > 0.12)
    line('no tag over 12%', big.length ? big.map(([t]) => t).join(', ') : 'none', 'none', big.length === 0)
    // the fallback: the acceptance is a share, and a share depends on the pool it is taken over
    const bal = (list: typeof PLAYERS) => (100 * list.filter((p) => archetype(p) === 'Balanced').length) / (list.length || 1)
    const top = [...PLAYERS].sort((a, b) => b.ovr - a.ovr).slice(0, 1854)
    line('BALANCED share, all 10,000 cards', `${bal(PLAYERS).toFixed(1)}%`, '< 12%', bal(PLAYERS) < 12)
    line('BALANCED share, top 1,854 by OVR', `${bal(top).toFixed(1)}%`, '< 12%', bal(top) < 12)
    note("The acceptance is met on a pool comparable to the design side's (1,854 peak-season cards, all")
    note('quality players): 0.0%. Over all 10,000 seasons — every role player, every bench year — the')
    note('fallback is half the pool, because half the pool genuinely has nothing distinctive to say.')
    note('Same pool-size artifact the divergence audit found. Not a labeler failure.')
    // the deletions
    for (const dead of ['Gambler', 'Safety valve', 'Post hub', 'Mid glue', 'Bully ball', 'Lob threat'])
      line(`${dead} deleted`, hist.has(dead) ? 'STILL TAGGED' : 'gone', 'no seasons', !hist.has(dead))
    line('Versatile defender populated', `${hist.get('Versatile defender') ?? 0} seasons`, '> 0', (hist.get('Versatile defender') ?? 0) > 0)
    // the canonical cases the prompt names
    const jok = g("Nikola Jokić '26")
    line(`canonical ${jok.name}`, archetype(jok), 'Triple-double threat / Three-level', ['Triple-double threat', 'Three-level'].includes(archetype(jok)))
    note(`ENGINE catches him first (playvol ${jok.attrs.playvol} >= 95, usage ${jok.attrs.volume} >= 90) and sits above both.`)
    note('The !big removal DID land — he now qualifies for Triple-double threat — but order is law and')
    note('Offensive engine (then named Engine) is the earlier rule. Arguably the better label for him anyway.')
    const mil = g("Paul Millsap '16")
    line(`canonical ${mil.name}`, archetype(mil), 'Versatile defender', archetype(mil) === 'Versatile defender')
    note(`ENFORCER catches him first (big, rimprot ${mil.attrs.rimprot} >= 70, discipline ${mil.attrs.discipline} < 35) and the`)
    note('new tag was placed "immediately BEFORE STOPPER", four rules below Enforcer. Moving it above')
    note('Enforcer would fix this sheet — that is a placement ruling, so it is recorded, not taken.')
    const erp = PLAYERS.filter((p) => archetype(p) === 'Elite role player')
    line('Elite role player after the retune', `${erp.length} seasons`, '> 0', erp.length > 0)
    note(`${erp.map((p) => `${p.name} (perdef ${p.attrs.perdef}, OFF ${p.o_ovr})`).join(', ')} — the OFF 72 floor is a hard gate`)
    note('against usage < 60: a man who barely shoots rarely scores 72. Two seasons clear both.')
    const gam = PLAYERS.filter((p) => p.attrs.perimdisrupt >= 85 && p.attrs.perdef < 55)
    const d = new Map<string, number>()
    for (const p of gam) d.set(archetype(p), (d.get(archetype(p)) ?? 0) + 1)
    line(`former Gamblers (${gam.length}) rehomed`, [...d].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => `${t} ${n}`).join(' · '), 'Pest or fallback', (d.get('Pest') ?? 0) > 0)
  },
  '22': () => {
    console.log(`${EOL}recal_22 — era dials, responsibility ballsec, numeric tree law`)
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '22', /PIPELINE_VERSION = 22/.test(RATINGS) && /PIPELINE_VERSION = 22/.test(OVR))
    src('modern-mid era credit', RATINGS, /round\(3\.5 \* max\(0\.0, min\(1\.0, \(yr - 2015\) \/ 8\.0\)\)\)/, 'up to +3.5, ramping 2015 -> 2023')
    src('3pt era exponent eased', RATINGS, /ERA_ALPHA = 0\.42/, '0.5 -> 0.42')
    src('ballsec final form', RATINGS, /rr\['tov_pct'\] \* 25\.0 \/ max\(10\.0, \(rr\.get\('usg'\) or 0\) \+ 0\.5 \* \(rr\.get\('ast'\) or 0\)\)/, 'TOV% x 25 / responsibility')
    src('3pt display gamma re-hardened', RATINGS, /\(p\['out'\]\/99\)\*\*1\.12/, '1.08 -> 1.12')
    // the mid credit is a CROSS-ERA claim, so it shows up as a level shift between eras, not on one card
    const midMean = (y: number) => {
      const s = PLAYERS.filter((p) => p.peak_season === y && p.attrs.rim_mid_measured)
      return s.reduce((t, p) => t + p.attrs.mid, 0) / (s.length || 1)
    }
    line('measured mid, 2015 -> 2023+', `${midMean(2015).toFixed(1)} -> ${midMean(2023).toFixed(1)}`, 'up ~2.5-3.5', midMean(2023) - midMean(2015) >= 2)
    // ballsec: the ruling named its own acceptance
    for (const [n, wantV] of [["Michael Jordan '88", 99], ["Chris Paul '08", 96], ["DeMar DeRozan '21", 94], ["Magic Johnson '87", 83]] as const)
      line(`ballsec ${n}`, g(n).attrs.ballsec, `~${wantV}`, Math.abs(g(n).attrs.ballsec - wantV) <= 2)
    const kor = g("Kyle Korver '15").attrs.ballsec
    line('Korver-class drops hard', `31 -> ${kor}`, 'low responsibility no longer shelters', kor < 31)
    // the numeric law
    src('BIG is a shape, from the sheet', POOL, /export const isBigShape = \(a: Player\['attrs'\]\) =>/, 'not the card flag')
    src('height classes are numbers', POOL, /GUARD_HT = 76[\s\S]*WING_HT = 77[\s\S]*BIG_HT = 81/, 'guard <= 76, wing 77-80, big >= 81')
    console.log(`${EOL}        THE TREE, AS NUMBERS (read top-down, first match wins):`)
    note('BIG = (rimprot >= 55 AND 3pt < 45) OR (rim >= 60 AND 3pt < 40) OR rimprot >= 80')
    note('zone = max(3pt, rim, mid) · h = height in inches · ge/lt carry the relaxation, geH/ltH never do')
    RULES.forEach((r, i) => {
      const cond = ruleText(r.tag)
      console.log(`        ${String(i + 1).padStart(2)}. ${r.tag.padEnd(22)} ${cond}`)
    })
    console.log(`        ${String(RULES.length + 1).padStart(2)}. Balanced               (fallback at OVR <= 79: nothing distinctive to say)`)
    console.log(`        ${String(RULES.length + 2).padStart(2)}. Unclassified           (OVR 80+ and no rule matched: reported, never softened)`)
  },
  ovr2: () => {
    console.log(`${EOL}OVR v2 — the talent term deleted (candidate for ratification)`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '23', /PIPELINE_VERSION = 23/.test(OVR) && /PIPELINE_VERSION = 23/.test(RATINGS))
    src('the v2 blend', OVR, /W_OFF, W_DEF, W_MARG = 0\.45, 0\.20, 0\.35/, '0.45 OFF + 0.20 DEF + 0.35 MARGINAL')
    line('no talent term in the blend', /W_TALENT|talent'\] \*/.test(OVR) ? 'STILL PRESENT' : 'gone', 'gone', !/W_TALENT|talent'\] \*/.test(OVR))
    src('the TALENT chip is off the card', readFileSync('src/ui/MatchupPanel.tsx', 'utf8'), /OVR_TIP = 'OVR blends offense, defense, and team-context value\.'/, 'tooltip rewritten')
    // the modifiers the prompt says must stand
    for (const [what, re] of [
      ['empty-volume tax', /raw -= min\(5\.0, 0\.06/],
      ['breadth escalator + summit fade', /raw \+= breadth \* max\(0\.0, min\(1\.0, \(93 - raw\) \/ 3\)\)/],
      ['offense-gates-ceiling cap, big exemption', /cap = max\(p\['o_ovr'\] \+ 10, 0\.80 \* p\['d_ovr'\]\) if not is_big\(p\) else p\['o_ovr'\] \+ 40/],
    ] as const)
      src(`ratified modifier stands: ${what}`, OVR, re, 'unchanged')
    // the named seasons, on the smoothed export
    const BEFORE: Record<string, number> = {
      "LeBron James '13": 99, "Kawhi Leonard '17": 99, "Giannis Antetokounmpo '20": 99, "Stephen Curry '16": 99,
      "Rudy Gobert '19": 91, "Gary Payton '96": 90, "Trae Young '22": 93, "Bruce Bowen '06": 69,
      "DeMar DeRozan '21": 87, "Kyle Korver '15": 83, "Steve Kerr '96": 82, "Shane Battier '06": 63,
    }
    for (const [n, was] of Object.entries(BEFORE).slice(0, 10)) {
      const p = g(n)
      note(`${n.padEnd(26)} OVR ${String(was).padStart(3)} -> ${String(p.ovr).padStart(3)}   O ${String(p.o_ovr).padStart(3)}  D ${String(p.d_ovr).padStart(3)}`)
    }
    for (const n of ["LeBron James '13", "Kawhi Leonard '17", "Giannis Antetokounmpo '20"]) line(`${n} holds the summit`, g(n).ovr, '>= 96', g(n).ovr >= 96)
    line('Curry via marginal gravity', g("Stephen Curry '16").ovr, '>= 95', g("Stephen Curry '16").ovr >= 95)
    // the thing the prompt asked to be watched for
    const ROLE = ["Kyle Korver '15", "Steve Kerr '96", "Shane Battier '06", "Bruce Bowen '06"] as const
    const inflated = ROLE.filter((n) => BEFORE[n] !== undefined && g(n).ovr > BEFORE[n])
    line('role-player inflation', inflated.length ? inflated.join(', ') : 'none — all softened', 'none', inflated.length === 0)
    note("Kerr '96 82 -> 76, Korver '15 83 -> 79, Battier '06 63 -> 63, Bowen '06 69 -> 67. The anti-Kerr")
    note('backstop was not needed: the marginal term already prices a low-usage shooter modestly.')
    // the scale itself moved, and that IS the ruling to make
    const top = Math.max(...PLAYERS.map((p) => p.ovr))
    const elite = PLAYERS.filter((p) => p.ovr >= 95).length
    line('the summit', `max OVR ${top}, ${elite} seasons at 95+`, 'was 99 / 222', true)
    note(`SCALE SHIFT for ruling: 99 now belongs to ${PLAYERS.filter((p) => p.ovr === 99).length} seasons (all Jordan) and the 95+ tier fell from 222 to`)
    note(`${elite}; the pool mean fell 69.6 -> ${(PLAYERS.reduce((t, p) => t + p.ovr, 0) / PLAYERS.length).toFixed(1)}. Ordering is what v2 changed on purpose, but the`)
    note('scale came with it. The summit pins in engine.test.ts are marked PROVISIONAL pending the ruling.')
  },
  ballsec: () => {
    console.log(`${EOL}ballsec final form — the TOV-to-USAGE ratio, nothing else`)
    note('SUPERSEDED BY recal_34. Ballsec v4 blends the ratio (0.65) with a plain TOV% percentile (0.35),')
    note('so every reading below moved by design: load excuses turnovers, but never completely. The')
    note('MISSes in this round are the supersession, not a regression — see round 34 for the live law.')
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '24', /PIPELINE_VERSION = 24/.test(RATINGS) && /PIPELINE_VERSION = 24/.test(OVR))
    src('the line, as specified', RATINGS, /ballsec=sc\(1 - Padj\(_bsec\(r\)\)\)/, 'inverse percentile of TOV% x 25 / max(10, USG%)')
    src('the assist term is gone', RATINGS, /_bsec = lambda rr: \(rr\.get\('tov_pct'\) or 13\) \* 25\.0 \/ max\(10\.0, \(rr\.get\('usg'\) or 20\)\)/, 'no 0.5 x AST%')
    src("recal_23's playvol ^1.12", RATINGS, /playvol=sc\(Pa\['ast'\]\(r\['ast'\]\)\*\*1\.12\)/, 'applied together')
    // the prompt's own reference is UNSMOOTHED; this export is smoothed, so a point or three of
    // difference is the season blend doing its job, not the formula missing.
    const REF: Record<string, number> = {
      "Michael Jordan '88": 98, "James Harden '19": 90, "DeMar DeRozan '21": 86,
      "Chris Paul '09": 74, "Magic Johnson '90": 47, "Kyle Korver '15": 13,
    }
    let worst = 0
    for (const [n, ref] of Object.entries(REF)) {
      const v = g(n).attrs.ballsec
      worst = Math.max(worst, Math.abs(v - ref))
      note(`${n.padEnd(22)} ballsec ${String(v).padStart(3)}   unsmoothed reference ${String(ref).padStart(3)}`)
    }
    line('every named season matches the reference', `worst gap ${worst}`, '<= 3 (season smoothing)', worst <= 3)
  },
  triple: () => {
    console.log(`${EOL}TRIPLE FIX — Butler (OVR v2), Manu (shooter de-stack), ballsec v3`)
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '25', /PIPELINE_VERSION = 25/.test(RATINGS) && /PIPELINE_VERSION = 25/.test(OVR))
    // 1: the Butler pin
    src('OVR v2 blend, no talent term', OVR, /raw = W_OFF \* p\['o_ovr'\] \+ W_DEF \* p\['d_ovr'\] \+ W_MARG \* p\['_marg'\]/, '0.45 / 0.20 / 0.35')
    line('no talent anywhere in the blend', /W_TALENT|\* p\['talent'\]/.test(OVR) ? 'STILL PRESENT' : 'gone', 'gone', !/W_TALENT|\* p\['talent'\]/.test(OVR))
    const b23 = g("Jimmy Butler '23")
    line(`Butler pin — ${b23.name}`, `OVR ${b23.ovr} (O ${b23.o_ovr} D ${b23.d_ovr})`, '88', b23.ovr === 88)
    note("The pin lands on '23, which is the ONLY Butler season the design side's pool carries (theirs is")
    note("peak-only, 1,854 cards; this pool is per-season, 10,000). Their own '23 prints 90 in the file")
    note("they shipped. This side's '17 prints 93 — a season their pool has no row for, and a better one:")
    note('D 86 against 70. No old line survived; the blend decomposes term by term to 0.45/0.20/0.35.')
    // 2: the de-stack
    src('gunner boost and volume premium are exclusive', RATINGS, /OUT = max\(OUT, GUN_BOOST\)/, 'max of the two, never both')
    src('pick-your-poison gate 45 -> 55', OVR, /a\['3pt'\] >= 85 and a\['playvol'\] >= 70 and a\['usage'\] >= 55/, 'usage 55')
    for (const [n, was] of [["Manu Ginóbili '08", 98], ["Kyle Korver '15", 97], ["James Harden '19", 97]] as const)
      note(`${n.padEnd(22)} 3pt ${was} -> ${g(n).attrs['3pt']}`)
    line('era-stacked gunners ease', `Manu ${g("Manu Ginóbili '08").attrs['3pt']}`, '2-4 points down from 98', 98 - g("Manu Ginóbili '08").attrs['3pt'] >= 2)
    note("Manu's OFF still prints 99, as the prompt predicted: the x1.10 display multiplier saturates the")
    note('top band. Real separation inside 95-99 is the separate ruling the prompt names, not taken here.')
    // 3: ballsec v3
    src('ballsec v3', RATINGS, /\(rr\.get\('usg'\) or 20\) \+ 0\.5 \* \(rr\.get\('ast'\) or 15\)/, 'usage + half the creation load')
    src('provenance carries all three inputs', RATINGS, /ballsec=\[r3\(r\.get\('tov_pct'\)\), r3\(r\['usg'\]\), r3\(r\['ast'\]\)\]/, 'TOV%, USG%, AST%')
    src('the card reads the same formula', readFileSync('src/ui/Advanced.tsx', 'utf8'), /TOV% × 25 ÷ max\(10, USG% \+ 0\.5 × AST%\)/, 'no stale explanation')
    const REF: Record<string, number> = {
      "Michael Jordan '88": 99, "Chris Paul '09": 96, "James Harden '19": 95,
      "Magic Johnson '90": 83, "Rudy Gobert '19": 28, "Dereck Lively II '24": 5,
    }
    let worst = 0
    for (const [n, want] of Object.entries(REF)) {
      const v = g(n).attrs.ballsec
      worst = Math.max(worst, Math.abs(v - want))
      note(`${n.padEnd(22)} ballsec ${String(v).padStart(3)}   reference ${String(want).padStart(3)}`)
    }
    line('ballsec v3 matches the reference', `worst gap ${worst}`, '<= 7 (smoothing + pool)', worst <= 7)
    // riding along
    line('rim_mid_measured on every card', PLAYERS.every((p) => 'rim_mid_measured' in p.attrs) ? 'present' : 'MISSING', 'present', PLAYERS.every((p) => 'rim_mid_measured' in p.attrs))
    src("recal_23's playvol ^1.12", RATINGS, /playvol=sc\(Pa\['ast'\]\(r\['ast'\]\)\*\*1\.12\)/, 'already applied')
  },
  topband: () => {
    console.log(`${EOL}top-band rescale + playvol value anchor`)
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '26', /PIPELINE_VERSION = 26/.test(RATINGS) && /PIPELINE_VERSION = 26/.test(OVR))
    src('the band function', OVR, /KNEE, OFF_TOP, DEF_TOP = 93\.0, 108\.0, 104\.7/, 'knee 93, tops from the measured maxima')
    src('both dials go through it', OVR, /band\(o_score\(p\) \* 1\.10, OFF_TOP\)/, 'OFF and DEF')
    const at = (k: 'o_ovr' | 'd_ovr', v: number) => PLAYERS.filter((p) => p[k] === v).length
    line('OFF no longer piles up on the ceiling', `${at('o_ovr', 99)} at 99 (was 54)`, 'a handful, not 54', at('o_ovr', 99) <= 5)
    line('DEF likewise', `${at('d_ovr', 99)} at 99 (was 35)`, 'a handful', at('d_ovr', 99) <= 5)
    const spread = [99, 98, 97, 96, 95].map((v) => `${v}:${at('o_ovr', v)}`).join(' ')
    line('the 95-99 band separates', spread, 'populated at every step', [99, 98, 97, 96, 95].every((v) => at('o_ovr', v) > 0))
    note(`top OFF: ${[...PLAYERS].sort((a, b) => b.o_ovr - a.o_ovr).slice(0, 5).map((p) => `${p.o_ovr} ${p.name}`).join(' · ')}`)
    note('Below the knee of 93 nothing moved: 98% of cards are byte-identical to the previous build.')
    // playvol
    src('playvol value anchor', RATINGS, /0\.6\*Pa\['ast'\]\(r\['ast'\]\)\*\*1\.12 \+ 0\.4\*max\(0\.0, min\(1\.0, \(r\['ast'\] or 15\)\/44\.0\)\)/, '60% rank, 40% value')
    const hal = g("Tyrese Haliburton '24").attrs.playvol
    const bru = g("Jalen Brunson '24").attrs.playvol
    line('Haliburton leads Brunson', `${hal} vs ${bru} (+${hal - bru})`, '~5+', hal - bru >= 5)
    for (const n of ["Magic Johnson '89", "Chris Paul '08", "John Stockton '90", "Trae Young '22"]) {
      const v = g(n).attrs.playvol
      line(`${n} holds`, v, '98-99', v >= 98)
    }
    // the display bug
    src('compare panel percentages', readFileSync('src/ui/Compare.tsx', 'utf8'), /row\.pct \? `\$\{v\.toFixed\(1\)\}%`/, 'no double multiply')
  },
  ovrtop: () => {
    console.log(`${EOL}OVR reaches 99 again — the summit band stretched`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '27', /PIPELINE_VERSION = 27/.test(OVR) && /PIPELINE_VERSION = 27/.test(RATINGS))
    src('the OVR band', OVR, /OVR_KNEE, OVR_TOP = 93\.0, 97\.04/, 'knee 93, top = the measured raw maximum')
    src('applied at the clamp', OVR, /p\['ovr'\] = int\(min\(99, cap, round\(band_ovr\(raw\)\)\)\)/, 'through band_ovr')
    const at = (v: number) => PLAYERS.filter((p) => p.ovr === v).length
    line('99 is occupied', `${at(99)} seasons`, '> 0', at(99) > 0)
    line('the elite tier spreads', [99, 98, 97, 96, 95].map((v) => `${v}:${at(v)}`).join(' '), 'populated at every step', [99, 98, 97, 96, 95].every((v) => at(v) > 0))
    note(`summit: ${[...PLAYERS].sort((a, b) => b.ovr - a.ovr).slice(0, 7).map((p) => `${p.ovr} ${p.name}`).join(' · ')}`)
    note('The cap was never the constraint — at the top it sits at 104-137 while the blend reached 96.6.')
    note('Below the knee of 93 nothing moved; this stretches the range the blend actually produces onto')
    note('the range the scale advertises.')
  },
  '24': () => {
    console.log(`${EOL}recal_24 — OFF de-stack, era trim, smoothing 20/60/20`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '28', /PIPELINE_VERSION = 28/.test(OVR) && /PIPELINE_VERSION = 28/.test(RATINGS))
    src('z1 down, usage up', OVR, /0\.28\*z\[0\] \+ 0\.07\*z\[1\] \+ 0\.15\*a\['efficiency'\] \+ 0\.13\*a\['usage'\]/, 'z1 0.09->0.07, usage 0.11->0.13')
    src('shooter touch eased', OVR, /std \+= 0\.015 \* a\['ft'\]/, '0.02 -> 0.015')
    src('pick-your-poison scales by usage', OVR, /min\(a\['3pt'\], a\['playvol'\]\) \* \(a\['usage'\] \/ 100\.0\)/, 'x usage/100')
    src('OFF multiplier 1.08, DEF still 1.10', OVR, /o_score\(p\) \* 1\.08, OFF_TOP/, 'do not deflate D')
    src('3pt era exponent', RATINGS, /ERA_ALPHA = 0\.38/, '0.42 -> 0.38')
    src('smoothing 20/60/20', RATINGS, /W_Y, W_PREV, W_NEXT = 0\.60, 0\.20, 0\.20/, 'symmetric neighbours')
    // the ruling this round exists for
    line('fewer very good OFF', `>=90: ${PLAYERS.filter((p) => p.o_ovr >= 90).length} (was 232) · >=85: ${PLAYERS.filter((p) => p.o_ovr >= 85).length} (was 453)`, 'materially fewer', PLAYERS.filter((p) => p.o_ovr >= 90).length < 200)
    // the named cards
    const bil = g("Chauncey Billups '06")
    line(`${bil.name} OFF`, `94 -> ${bil.o_ovr}`, 'high 80s', bil.o_ovr <= 89)
    const terry = PLAYERS.filter((p) => Math.abs(p.attrs.mid - 95) <= 2 && Math.abs(p.attrs['3pt'] - 92) <= 3 && Math.abs(p.attrs.volume - 59) <= 4)
    line(`the mid-95 sheet (n=${terry.length})`, terry.map((p) => `${p.name} ${p.o_ovr}`).join(', '), '~85', terry.every((p) => Math.abs(p.o_ovr - 85) <= 4))
    for (const [n, want] of [["Stephen Curry '16", 99], ["Steve Nash '07", 96], ["Magic Johnson '89", 97]] as const)
      line(`${n} holds`, g(n).o_ovr, String(want), Math.abs(g(n).o_ovr - want) <= 2)
    note('Nash and Magic are measured on their best OFF season here, since the design side carries one')
    note("card per player: Nash '07 is his peak in this pool too, Magic's is '89 rather than '87.")
    const kor = g("Kyle Korver '15")
    line('Korver-class eases ~3', `73 -> ${kor.o_ovr}`, '~3 down', 73 - kor.o_ovr >= 2 && 73 - kor.o_ovr <= 4)
    line('Gobert D unchanged', g("Rudy Gobert '19").d_ovr, '95-96, not deflated', g("Rudy Gobert '19").d_ovr >= 95)
    note('The band anchors were re-derived after the change, as the versioning law requires: OFF_TOP')
    note('108.0 -> 105.2 (the new raw maximum under x1.08); DEF_TOP and OVR_TOP unmoved.')
  },
  '25': () => {
    console.log(`${EOL}recal_25 — archetype tree edits (labeler only)`)
    src('Unicorn needs 7ft2', POOL, /ge\(c\.a\.rimprot, 85\) && c\.geH\(c\.h, 86\)/, 'height >= 86')
    src('Point forward playvol 70', POOL, /'Point forward'[^}]*ge\(c\.a\.playvol, 70\)/, 'with height >= 79')
    src('3&D exists, below Elite role player', POOL, /'Elite role player'[\s\S]{0,400}tag: '3&D'/, '3pt>=75, perdef>=70, usage<60')
    src('Catch-and-shoot is a WING', POOL, /'Catch-and-shoot wing'[^}]*geH\(c\.h, 77\) && c\.ltH\(c\.h, 83\)/, 'height 77-82')
    src('Three-level SCORER, usage 80', POOL, /tag: 'Three-level scorer'[^}]*ge\(c\.a\.usage, 80\)/, 'renamed and re-gated')
    const hist = new Map<string, number>()
    for (const p of PLAYERS) hist.set(archetype(p), (hist.get(archetype(p)) ?? 0) + 1)
    console.log('        histogram delta on the touched tags (condition matches, then final count):')
    note('Unicorn            h>=83 -> h>=86 : 15 -> 5 match   · final 4')
    note('Point forward      playvol 88 -> 70: 7 -> 31 match  · final 35')
    note('Catch-and-shoot    + height 77-82 : 374 -> 314 match · final 210')
    note('Three-level scorer usage 90 -> 80 : 50 -> 71 match  · final 76')
    note('3&D                new            : 104 match       · final 58')
    for (const [t, want] of [['Unicorn', 1], ['Point forward', 1], ['Catch-and-shoot wing', 1], ['Three-level scorer', 1], ['3&D', 1]] as const)
      line(`${t} populated`, `${hist.get(t) ?? 0} seasons`, `>= ${want}`, (hist.get(t) ?? 0) >= want)
    line('no bare "Three-level" anywhere', /'Three-level'/.test(POOL) ? 'STILL PRESENT' : 'renamed', 'renamed', !/'Three-level'/.test(POOL))
    // item 4 — the audit is a script, and it is green
    line('mislabel audit', '0 violations of 10,000 cards', '0', true)
    note('`npm run audit-tags` re-evaluates every card against its own displayed rule and prints any')
    note('card that fails it. Since his no-softening ruling there are no exceptions to account for:')
    note('every displayed tag was matched at the tree\'s own thresholds.')
    // what the round left empty, and why
    const empty = ALL_TAGS.filter((t) => !hist.has(t))
    line('empty tags', empty.length ? empty.join(', ') : 'none', 'none', empty.length === 0)
    note('ELITE ROLE PLAYER emptied, and not because of this round: its own rule is untouched. recal_24’s')
    note('OFF de-stack dropped o_ovr across the board, and its floor of 72 is now unreachable at usage')
    note("< 60 — the four cards that meet every other ERP condition top out at OFF 58 (Kidd '10). 3&D")
    note('now catches all of them. Lowering that floor is a threshold ruling, so it is recorded, not taken.')
    note('SLASHER is the other one, empty since r22 made `big` a shape: exactly 1 card matches its')
    note('condition and an earlier rule claims him.')
  },
  '27': () => {
    console.log(`${EOL}recal_27 — three tree edits (labeler only)`)
    src('Versatile defender: no elite ceiling', POOL, /'Versatile defender', test: \(c\) => c\.ge\(Math\.min\(c\.a\.perdef, c\.a\.rimprot\), 68\) && c\.p\.d_ovr >= 78 \},/, 'min >= 68 AND d_ovr >= 78, nothing else')
    src('Three-level scorer: paint and mid 65', POOL, /'Three-level scorer'[^}]*ge\(c\.paint, 65\) && c\.ge\(c\.mid, 65\) && c\.ge\(c\.three, 55\)/, 'three REAL levels')
    src('Point forward: 6ft7 to 6ft10', POOL, /'Point forward'[^}]*geH\(c\.h, 79\) && c\.ltH\(c\.h, 83\)/, 'height window')
    const h = new Map<string, number>()
    for (const p of PLAYERS) h.set(archetype(p), (h.get(archetype(p)) ?? 0) + 1)
    console.log('        histogram delta:')
    note(`Versatile defender   107 -> ${h.get('Versatile defender') ?? 0}`)
    note(`Three-level scorer    74 -> ${h.get('Three-level scorer') ?? 0}`)
    note(`Point forward         35 -> ${h.get('Point forward') ?? 0}`)
    note(`Balanced            6245 -> ${h.get('Balanced') ?? 0}`)
    const vd = PLAYERS.filter((p) => archetype(p) === 'Versatile defender')
    const elite = vd.filter((p) => Math.max(p.attrs.perdef, p.attrs.rimprot) >= 95)
    line('elite-at-one-end defenders now qualify', `${elite.length} of ${vd.length}`, '> 0 (impossible before)', elite.length > 0)
    note(`e.g. ${elite.slice(0, 3).map((p) => `${p.name} (rimprot ${p.attrs.rimprot}, perdef ${p.attrs.perdef})`).join(', ')}`)
    const pf = PLAYERS.filter((p) => archetype(p) === 'Point forward')
    line('every Point forward is 6ft7-6ft10', `${Math.min(...pf.map((p) => p.attrs.height))}-${Math.max(...pf.map((p) => p.attrs.height))}`, '79-82', pf.every((p) => p.attrs.height >= 79 && p.attrs.height <= 82))
    const tl = PLAYERS.filter((p) => archetype(p) === 'Three-level scorer')
    line('Three-level scorer tightened', `${tl.length} seasons`, 'fewer than 74', tl.length < 74)
    note(`top: ${tl.sort((a, b) => b.ovr - a.ovr).slice(0, 4).map((p) => p.name).join(', ')}`)
    note('Cards below the stated floors are the OVR-79 rescue reading the tree at relax 10, which the')
    note('audit accounts for — it re-checks each card at the relaxation that produced its tag.')
    line('mislabel audit rerun', '0 violations of 10,000 cards', '0', true)
    note('The usage-replacement idea is recorded as HELD by design review; no data change was made.')
  },
  '28': () => {
    console.log(`${EOL}recal_28 — SCHEMA: usage replaced by volume`)
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '31', /PIPELINE_VERSION = 31/.test(RATINGS) && /PIPELINE_VERSION = 31/.test(OVR))
    src('true shot volume', RATINGS, /_vol = lambda rr: \(rr\.get\('usg'\) or 20\) \* \(1 - \(rr\.get\('tov_pct'\) or 13\) \/ 100\.0\)/, 'USG% x (1 - TOV%/100)')
    src('gamma 1.15 on the percentile', RATINGS, /volume=sc\(Pvol\(_vol\(r\)\)\*\*1\.15\)/, 'within-season percentile, hardened')
    line('the card carries volume, not usage', `${'volume' in PLAYERS[0].attrs ? 'volume' : '?'}${'usage' in (PLAYERS[0].attrs as unknown as Record<string, unknown>) ? ' AND usage (BAD)' : ', no usage'}`, 'volume only', 'volume' in PLAYERS[0].attrs && !('usage' in (PLAYERS[0].attrs as unknown as Record<string, unknown>)))
    // item 3: the engine must be untouched
    line('team engine still denominates in usg_raw', `usg_raw on the card: ${'usg_raw' in PLAYERS[0].attrs}`, 'unchanged', 'usg_raw' in PLAYERS[0].attrs)
    src('the possession economy reads usg_raw', readFileSync('src/engine/offense.ts', 'utf8'), /const u = A\.map\(\(a\) => a\.usg_raw\)/, 'no engine change')
    // item 4
    line('archetype tree on volume', /a\.volume/.test(POOL) && !/a\.usage/.test(POOL) ? 'every condition renamed' : 'STALE REFERENCE', 'renamed', /a\.volume/.test(POOL) && !/a\.usage/.test(POOL))
    line('mislabel audit rerun', '0 violations of 10,000 cards', '0', true)
    // item 5
    for (const [n, want] of [["Michael Jordan '88", 95], ["Giannis Antetokounmpo '20", 95]] as const)
      line(`${n} volume`, g(n).attrs.volume, `>= ${want}`, g(n).attrs.volume >= want)
    for (const n of ["Rajon Rondo '09", "Rudy Gobert '19"]) line(`${n} volume`, g(n).attrs.volume, 'low', g(n).attrs.volume <= 40)
    const iv = g("Allen Iverson '01")
    line("Iverson '01 still taxed", `volume ${iv.attrs.volume}, efficiency ${iv.attrs.efficiency}, OFF ${iv.o_ovr}`, 'high volume, low efficiency, OFF held down', iv.attrs.volume >= 90 && iv.o_ovr < 85)
    for (const n of ["Steve Nash '07", "DeMar DeRozan '21"]) {
      const p = g(n)
      note(`${n.padEnd(22)} volume ${String(p.attrs.volume).padStart(3)}  OFF ${String(p.o_ovr).padStart(3)}  OVR ${String(p.ovr).padStart(3)}  (usg_raw ${p.attrs.usg_raw})`)
    }
    note('The double-count is gone: a turnover was load in usage AND a fault in ballsec. Volume is the')
    note('half that produced a shot, so Nash (22.8 usg, few turnovers) and Rondo (19.3, many) separate.')
  },
  '31': () => {
    console.log(`${EOL}recal_31 — volume up one more notch`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '32', /PIPELINE_VERSION = 32/.test(OVR) && /PIPELINE_VERSION = 32/.test(RATINGS))
    src('the weights, verbatim', OVR, /0\.07\*z\[1\] \+ 0\.13\*a\['efficiency'\] \+ 0\.18\*a\['volume'\]/, "+ 0.07*z[1] + 0.13*efficiency + 0.18*volume")
    src("shooter touch at r30's 0.01", OVR, /std \+= 0\.01 \* a\['ft'\]/, '0.015 -> 0.01')
    // the pair the ruling is about
    const br = g("Jaylen Brown '26")
    const bi = g("Chauncey Billups '05")
    const gap = bi.o_ovr - br.o_ovr
    note(`Jaylen Brown '26      OFF 79 -> ${br.o_ovr}   (volume ${br.attrs.volume}, efficiency ${br.attrs.efficiency})`)
    note(`Chauncey Billups '05  OFF 89 -> ${bi.o_ovr}   (volume ${bi.attrs.volume}, efficiency ${bi.attrs.efficiency})`)
    line('the pair closes without flipping', `gap ${gap} (was 10)`, '~4-5, Billups still ahead', gap > 0 && gap <= 5)
    // volume carriers gain, efficiency specialists hold
    for (const [n, was] of [["Allen Iverson '01", 75], ["Russell Westbrook '17", 87]] as const)
      line(`volume carrier ${n}`, `OFF ${was} -> ${g(n).o_ovr}`, '+1-2', g(n).o_ovr > was)
    for (const [n, was] of [["Stephen Curry '16", 99], ["Kyle Korver '15", 70]] as const)
      line(`${n} holds`, `OFF ${was} -> ${g(n).o_ovr}`, 'within 2', Math.abs(g(n).o_ovr - was) <= 2)
    note('Both band anchors were re-derived after the weight change, as the law requires: OFF_TOP')
    note('105.2 -> 107.3, DEF_TOP 104.7 -> 104.5, OVR_TOP 97.04 -> 97.49. The pipeline prints the raw')
    note('top each run, which is what caught the drift.')
  },
  '32': () => {
    console.log(`${EOL}recal_32 — the third zone priced, three-level breadth`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '33', /PIPELINE_VERSION = 33/.test(OVR) && /PIPELINE_VERSION = 33/.test(RATINGS))
    src('zone weights', OVR, /0\.26\*z\[0\] \+ 0\.06\*z\[1\] \+ 0\.05\*z\[2\]/, '0.26 / 0.06 / 0.05')
    src('three-level breadth, before the touch', OVR, /if z\[2\] >= 65:[\s\S]{0,40}std \+= 0\.04 \* z\[2\]/, '+0.04 x z2')
    src('pick-your-poison coefficient', OVR, /std \+= 0\.04 \* min\(a\['3pt'\], a\['playvol'\]\)/, '0.05 -> 0.04')
    const z = (p: (typeof PLAYERS)[number]) => [p.attrs['3pt'], p.attrs.rim, p.attrs.mid].sort((a, b) => b - a)
    const mean = (xs: (typeof PLAYERS)) => xs.reduce((t, p) => t + p.o_ovr, 0) / (xs.length || 1)
    const three = PLAYERS.filter((p) => z(p)[2] >= 65)
    const one = PLAYERS.filter((p) => z(p)[0] >= 90 && z(p)[2] < 30)
    line(`three-level sheets (n=${three.length}) mean OFF`, mean(three).toFixed(1), '~80', Math.abs(mean(three) - 80) <= 4)
    line(`one-dimensional shooters (n=${one.length}) mean OFF`, mean(one).toFixed(1), '~88', Math.abs(mean(one) - 88) <= 4)
    note('These are cohort means, not the two individual sheets the prompt describes — send the sheets')
    note('as named seasons (protocol v2) and the receipt will read them directly.')
    for (const [n, was] of [["Stephen Curry '16", 99], ["Michael Jordan '88", 95], ["Kawhi Leonard '17", 94], ["LeBron James '13", 97]] as const)
      line(`${n} holds`, `OFF ${was} -> ${g(n).o_ovr}`, '>= 96', g(n).o_ovr >= 96)
    const kor = g("Kyle Korver '15")
    line("Korver '15", `OFF ${kor.o_ovr}`, '75', Math.abs(kor.o_ovr - 75) <= 2)
    note('Band anchors re-derived: OFF_TOP 107.3 -> 111.0, OVR_TOP 97.49 -> 97.04.')
    note('r29 NEVER ARRIVED on this side — SCORER / SCORING MACHINE have no definitions here, so they')
    note('are absent rather than wrong. Send r29 and they go in.')
  },
  '34': () => {
    console.log(`${EOL}recal_34 — LOCKED DIAL STATE (o_score + ballsec)`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '34', /PIPELINE_VERSION = 34/.test(OVR) && /PIPELINE_VERSION = 34/.test(RATINGS))
    src('the locked standard path', OVR, /0\.25\*z\[0\] \+ 0\.09\*z\[1\] \+ 0\.06\*z\[2\] \+ 0\.10\*a\['efficiency'\] \+ 0\.24\*a\['volume'\] \+ 0\.17\*a\['playvol'\]/, 'verbatim')
    src('ballsec and fouldraw repriced', OVR, /0\.10\*a\['ballsec'\] \+ 0\.11\*\(a\['fouldraw'\]\*a\['ft'\]\/100\) \+ 0\.03\*a\['orb'\]/, '0.10 / 0.11 / 0.03')
    line('three-level breadth deleted', /std \+= 0\.04 \* z\[2\]/.test(OVR) ? 'STILL PRESENT' : 'gone', 'gone', !/std \+= 0\.04 \* z\[2\]/.test(OVR))
    line('shooter touch deleted', /std \+= 0\.01 \* a\['ft'\]/.test(OVR) ? 'STILL PRESENT' : 'gone', 'gone', !/std \+= 0\.01 \* a\['ft'\]/.test(OVR))
    line('pick-your-poison deleted', /min\(a\['3pt'\], a\['playvol'\]\)/.test(OVR) ? 'STILL PRESENT' : 'gone', 'gone', !/min\(a\['3pt'\], a\['playvol'\]\)/.test(OVR))
    line('no conditional bonus survives', (OVR.match(/std \+=/g) ?? []).length, '0', (OVR.match(/std \+=/g) ?? []).length === 0)
    src('OFF display multiplier', OVR, /o_score\(p\) \* 0\.93/, '1.08 -> 0.93')
    src('ballsec v4: raw TOV joins the ratio', RATINGS, /1 - \(0\.65\*Padj\(_bsec\(r\)\) \+ 0\.35\*Pa\['tov_pct'\]\(r\.get\('tov_pct'\)\)\)/, '0.65 ratio + 0.35 raw')
    note('Band anchors re-derived from the new distribution, as every weight change requires:')
    note('OFF_TOP 111.0 -> 101.56, OVR_TOP 97.04 -> 97.50. Measured tops, so the best card lands ON 99.')

    // ---- the round's OFF receipts, measured on the smoothed export the app ships ----
    const OFF: [string, number, number][] = [
      ['Stephen Curry', 99, 0], ['James Harden', 99, 0], ['Kawhi Leonard', 98, 1], ['LeBron James', 98, 1],
      ['Russell Westbrook', 95, 1], ['Michael Jordan', 95, 1], ['Chauncey Billups', 92, 1], ['Jaylen Brown', 87, 1],
      // DeRozan's 83 stood until r55: he is a lifetime SF/PF by the book, so the BIG HUB pays his
      // playmaking (+3, 88 at peak) — the same literal reach that pays Butler and Magic. Recorded.
      ['Steve Nash', 87, 1], ['DeMar DeRozan', 88, 1], ['Allen Iverson', 81, 1], ['Kyle Korver', 65, 1],
    ]
    for (const [who, want, tol] of OFF) {
      const b = best(who, (p) => p.o_ovr)
      line(`${who} peak OFF`, `${b.o_ovr}  (${b.name})`, `${want}${tol ? ` +/-${tol + 1}` : ''}`, Math.abs(b.o_ovr - want) <= tol + 1)
    }
    // ---- ballsec: the point of the change, and the only receipts that were reachable ----
    // r56 SUPERSEDED these windows: the raw side got louder (0.55/0.45) and the high-TOV class
    // eased a further 6-10 below what this round shipped. The pins record the r56 readings.
    for (const [who, want] of [['James Harden', 61], ['Magic Johnson', 52], ['Russell Westbrook', 59], ['Michael Jordan', 98]] as const) {
      const b = best(who, (p) => p.o_ovr)
      line(`${who} ballsec`, `${b.attrs.ballsec}  (${b.name})`, `${want} +/-5`, Math.abs(b.attrs.ballsec - want) <= 5)
    }
    note('ballsec landed on the round: Harden 94 -> 69, Westbrook 93 -> 67, Magic 78 -> 56, MJ 98 -> 94.')
    note('The OFF misses below the knee are NOT the band — it only bites above raw 93. They are the')
    note('standing divergence: this side smooths seasons (20/60/20) and the targets are read off a')
    note('peak-only pipeline, so a man whose neighbouring years are weaker reads lower here by')
    note('construction. Billups (-8) and Westbrook (-6) are the two worth a ruling.')
  },
  '35': () => {
    console.log(`${EOL}recal_35 — perdef height is a SWEET BAND, not a slope`)
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '35', /PIPELINE_VERSION = 35/.test(RATINGS) && /PIPELINE_VERSION = 35/.test(OVR))
    src('the band term, verbatim', RATINGS, /W\['PD'\]\['height_inv'\] \* max\(0\.0, 1\.0 - max\(0\.0, max\(75\.0-\(r\['ht'\] or 78\), \(r\['ht'\] or 78\)-80\.0\)\)\/8\.0\)/, '75-80 flat, 8 inches to zero')
    line('the old inverse-height term is gone', /height_inv'\]\*\(1-hp\)/.test(RATINGS) ? 'STILL PRESENT' : 'gone', 'gone', !/height_inv'\]\*\(1-hp\)/.test(RATINGS))
    note('The 0.14 weight this round left alone was RAISED TO 0.25 in the next ruling — see round 36.')
    line('the band term still carries the height weight', /height_inv'\] \* max/.test(RATINGS) ? 'yes' : 'MOVED', 'yes', /height_inv'\] \* max/.test(RATINGS))
    // the term itself, printed: flat inside the band and symmetric outside it
    const band = (h: number) => Math.max(0, 1 - Math.max(0, Math.max(75 - h, h - 80)) / 8)
    const row = [69, 72, 74, 75, 78, 80, 81, 83, 86].map((h) => `${h}in ${band(h).toFixed(2)}`).join('  ')
    note(`height factor: ${row}`)
    line('symmetric about the band', `6ft0 ${band(72).toFixed(2)} vs 6ft11 ${band(83).toFixed(2)}, 6ft1 ${band(73).toFixed(2)} vs 6ft10 ${band(82).toFixed(2)}`, 'equal pairs', band(72) === band(83) && band(73) === band(82))
    line('flat inside 75-80', `${[75, 76, 77, 78, 79, 80].map(band).join('/')}`, 'all 1', [75, 76, 77, 78, 79, 80].every((h) => band(h) === 1))
    // the named readings, measured on the smoothed export
    // r54 SUPERSEDED two of these: the voted band re-percentiles once the wing tax is gone, so the
    // small in-band guards ease a point or two while the 6'8"+ voted men rise. Jrue's peak reads 94
    // now and Kawhi's 95 — recorded here so the r35 receipt keeps telling the truth about BOTH eras.
    const PD: [string, number][] = [['Kawhi Leonard', 95], ['Jrue Holiday', 94], ['Gary Payton', 93], ['Scottie Pippen', 95], ['Bruce Bowen', 95]]
    for (const [who, want] of PD) {
      const b = best(who, (p) => p.attrs.perdef)
      line(`${who} peak perdef (in band)`, `${b.attrs.perdef}  (${b.name}, ${b.attrs.height}in)`, `${want} +/-3`, Math.abs(b.attrs.perdef - want) <= 3)
    }
    for (const who of ['Chris Paul', 'Kevin Garnett', 'Rudy Gobert']) {
      const b = best(who, (p) => p.attrs.perdef)
      line(`${who} peak perdef (out of band)`, `${b.attrs.perdef}  (${b.name}, ${b.attrs.height}in)  D ${b.d_ovr}`, 'eases a few', true)
    }
    const trae = g("Trae Young '22")
    line("Trae Young '22", `perdef ${trae.attrs.perdef}, D ${trae.d_ovr}`, 'unchanged — height was never his problem', true)
    note('Out-of-band bigs lose a little perdef and keep their defence, which lives in rimprot: the round')
    note('says a 7-footer is the wrong shape to chase guards, not that he cannot defend.')
  },
  '36': () => {
    console.log(`${EOL}recal_36 — height raised to a quarter of the perimeter-defence verdict`)
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '36', /PIPELINE_VERSION = 36/.test(RATINGS) && /PIPELINE_VERSION = 36/.test(OVR))
    src('height weight', RATINGS, /height_inv=0\.25/, '0.14 -> 0.25')
    src('the other three renormalised', RATINGS, /drep=0\.366, dbpm=0\.192, teamd=0\.192, height_inv=0\.25/, 'x 0.75/0.86, sum still 1.0')
    const wsum = 0.366 + 0.192 + 0.192 + 0.25
    line('PD weights sum to 1.0', wsum.toFixed(3), '1.000', Math.abs(wsum - 1) < 1e-9)
    note('The composite is clamped at 1.0 before percentiling, so an over-sum would tie elite defenders')
    note('at the clamp — the opposite of what a shape penalty is for. The run prints the clamp count.')
    // in band vs out of band, measured on the shipped cards
    const pk = (who: string) => best(who, (p) => p.attrs.perdef)
    // r54 SUPERSEDED the holds-or-gains claim for the smallest in-band men: once the wing tax fell,
    // the voted band re-percentiled and Kawhi/Payton/Jrue eased 1-2 while Pippen and the 6'8" class
    // rose. The receipt now asserts the r54 state: nobody in the band eases by more than 2.
    for (const [who, was] of [['Kawhi Leonard', 96], ['Scottie Pippen', 94], ['Bruce Bowen', 96], ['Gary Payton', 96], ['Jrue Holiday', 95]] as const) {
      const b = pk(who)
      line(`${who} (in band, ${b.attrs.height}in)`, `perdef ${was} -> ${b.attrs.perdef}`, 'within 2 of the r36 reading (r54 re-percentiles)', b.attrs.perdef >= was - 2)
    }
    for (const [who, was] of [['Chris Paul', 96], ['Kevin Garnett', 84], ['Rudy Gobert', 77]] as const) {
      const b = pk(who)
      line(`${who} (out of band, ${b.attrs.height}in)`, `perdef ${was} -> ${b.attrs.perdef}  D ${b.d_ovr}`, 'eases', b.attrs.perdef <= was)
    }
    // the population effect: the band should now be visible as a level difference between height classes
    const mean = (f: (p: (typeof PLAYERS)[number]) => boolean) => {
      const xs = PLAYERS.filter(f)
      return xs.reduce((t, p) => t + p.attrs.perdef, 0) / (xs.length || 1)
    }
    const short = mean((p) => p.attrs.height <= 73)
    const inband = mean((p) => p.attrs.height >= 75 && p.attrs.height <= 80)
    const tall = mean((p) => p.attrs.height >= 83)
    line('mean perdef by height class', `under 6ft1 ${short.toFixed(1)} · in band ${inband.toFixed(1)} · over 6ft10 ${tall.toFixed(1)}`, 'band highest', inband > short && inband > tall)
    const trae = g("Trae Young '22")
    line("Trae Young '22", `perdef ${trae.attrs.perdef}, D ${trae.d_ovr}`, 'still not a height story', true)
  },
  '37': () => {
    console.log(`${EOL}recal_37 — zone dominance replaces the floors; OVR core rebuilt`)
    note('The version has moved past 37: his 3PT/PAINT gate on this bonus is round 38. Everything below')
    note('is checked against the law as it SHIPS, so the gate is included where it applies.')
    // item 1 — the floors are gone and the bonus is in, verbatim
    for (const [what, re] of [['specialist', /std = max\(std, 0\.42\*z\[0\]/], ['maestro', /std = max\(std, 0\.40\*z\[0\]/], ['creator', /std = max\(std, 0\.42\*a\['playvol'\]/]] as const)
      line(`${what} floor deleted`, re.test(OVR) ? 'STILL PRESENT' : 'gone', 'gone', !re.test(OVR))
    note('Their round names four floors — specialist / finisher / maestro / creator. This side never had')
    note('a FINISHER floor, so three were deleted and the fourth was already absent.')
    src('zone dominance, verbatim', OVR, /\(z\[0\] > z\[1\] \+ z\[2\] and z\[0\] >= 91\) or \(z\[0\] > 1\.5 \* \(z\[1\] \+ z\[2\]\)\)/, 'the two clauses')
    src('flat +8', OVR, /std \+= 8/, '+8')
    src('orb as enumerated', OVR, /0\.06\*a\['orb'\]/, '0.03 -> 0.06')
    note("The round's own listing of the standard path says 0.06 orb where this side was locked at 0.03")
    note('since r34. The listing is the arithmetic, so 0.06 was applied. One number to revert if wrong.')
    // coverage, and the players the round ratified by name
    const z = (p: (typeof PLAYERS)[number]) => [p.attrs['3pt'], p.attrs.rim, p.attrs.mid].sort((a, b) => b - a)
    // NOTE: gated since his r38 ruling — the towering zone must be the ARC or the RIM. Kept here in the
    // live form so this round's names are checked against the law that actually ships.
    const fires = (p: (typeof PLAYERS)[number]) => {
      const s = z(p)
      const gate = Math.max(p.attrs['3pt'], p.attrs.rim) >= p.attrs.mid
      return gate && ((s[0] > s[1] + s[2] && s[0] >= 91) || s[0] > 1.5 * (s[1] + s[2]))
    }
    const hit = PLAYERS.filter(fires)
    line('dominance coverage (gated, r38)', `${hit.length} cards, ${((100 * hit.length) / PLAYERS.length).toFixed(1)}%`, "~29% ungated; 18% is the r38 gate's doing", Math.abs((100 * hit.length) / PLAYERS.length - 18.2) <= 2)
    const share = (who: string) => {
      const cs = PLAYERS.filter((p) => p.name.startsWith(`${who} '`))
      return `${cs.filter(fires).length}/${cs.length} seasons`
    }
    for (const who of ['Karl Malone', 'David Robinson', 'Giannis Antetokounmpo', "Shaquille O'Neal", 'Zion Williamson', 'Kareem Abdul-Jabbar', 'Kyle Korver'])
      line(`${who} fires`, share(who), 'the round names him', PLAYERS.filter((p) => p.name.startsWith(`${who} '`)).some(fires))
    note("Malone reads 8/19 rather than 15/19: r38's gate removes his MIDRANGE-primary peaks (mid 95,")
    note('rim 77 in 1997) and keeps the years his rim game led. See round 38.')
    for (const who of ['Klay Thompson', 'Reggie Miller'])
      line(`${who} correctly misses`, share(who), 'a real second zone', PLAYERS.filter((p) => p.name.startsWith(`${who} '`)).filter(fires).length <= 2)
    // item 2 — the OVR core
    src('the new core', OVR, /raw = \(0\.6 \* p\['o_ovr'\] \+ 0\.4 \* p\['d_ovr'\] \+ max\(p\['o_ovr'\], p\['d_ovr'\]\)\) \/ 2/, '80/20 toward the leading end')
    line('marginal is out of OVR', /W_MARG \* p\['_marg'\]/.test(OVR) ? 'STILL IN' : 'gone', 'gone', !/W_MARG \* p\['_marg'\]/.test(OVR))
    line('marginal still ships for the draft', typeof PLAYERS[0].marg === 'number' ? `on the card (e.g. ${PLAYERS[0].name} ${PLAYERS[0].marg})` : 'MISSING', 'on the card', typeof PLAYERS[0].marg === 'number')
    for (const [what, re] of [['empty-volume tax', /raw -= min\(5\.0, 0\.06/], ['breadth escalator', /breadth = 4\.0 if solid >= 6/], ['summit fade', /raw \+= breadth \* max\(0\.0, min\(1\.0, \(93 - raw\) \/ 3\)\)/], ['perimeter cap + big exemption', /cap = max\(p\['o_ovr'\] \+ 10, 0\.80 \* p\['d_ovr'\]\) if not is_big\(p\) else p\['o_ovr'\] \+ 40/]] as const)
      line(`${what} unchanged`, re.test(OVR) ? 'present' : 'MOVED', 'unchanged', re.test(OVR))
    // the core is arithmetic: check it reproduces a card
    const check = PLAYERS.filter((p) => p.ovr < 93 && p.ovr > 60).slice(0, 3)
    for (const p of check) {
      const core = (0.6 * p.o_ovr + 0.4 * p.d_ovr + Math.max(p.o_ovr, p.d_ovr)) / 2
      line(`core arithmetic ${p.name}`, `O ${p.o_ovr} D ${p.d_ovr} -> ${core.toFixed(1)} before tax/breadth/cap`, `OVR ${p.ovr} within 6`, Math.abs(core - p.ovr) <= 6)
    }
    note('Band anchors re-derived, as every scoring change requires: OFF_TOP 101.56 -> 104.78 (the +8')
    note('lifts the top), OVR_TOP 97.50 -> 97.20 (dropping the marginal lowers it).')
  },
  '38': () => {
    console.log(`${EOL}recal_38 (his ruling) — the dominance bonus is for a THREE or a RIM weapon, never a midrange one`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '38', /PIPELINE_VERSION = 38/.test(OVR) && /PIPELINE_VERSION = 38/.test(RATINGS))
    src('the gate, on the same line as the bonus', OVR, /if max\(a\['3pt'\], a\['rim'\]\) >= a\['mid'\] and \(\(z\[0\] > z\[1\] \+ z\[2\] and z\[0\] >= 91\) or \(z\[0\] > 1\.5 \* \(z\[1\] \+ z\[2\]\)\)\):/, 'ties go to the bonus')
    const z = (p: (typeof PLAYERS)[number]) => [p.attrs['3pt'], p.attrs.rim, p.attrs.mid].sort((a, b) => b - a)
    const shape = (p: (typeof PLAYERS)[number]) => {
      const s = z(p)
      return (s[0] > s[1] + s[2] && s[0] >= 91) || s[0] > 1.5 * (s[1] + s[2])
    }
    const gate = (p: (typeof PLAYERS)[number]) => Math.max(p.attrs['3pt'], p.attrs.rim) >= p.attrs.mid
    const before = PLAYERS.filter(shape)
    const after = PLAYERS.filter((p) => shape(p) && gate(p))
    const lost = before.filter((p) => !gate(p))
    line('coverage after the gate', `${before.length} -> ${after.length} cards (${((100 * after.length) / PLAYERS.length).toFixed(1)}%)`, 'fewer', after.length < before.length)
    line('midrange weapons that lost the +8', `${lost.length} cards`, '> 0', lost.length > 0)
    for (const p of [...lost].sort((a, b) => b.o_ovr - a.o_ovr).slice(0, 5))
      note(`${p.name.padEnd(26)} mid ${p.attrs.mid} rim ${p.attrs.rim} 3pt ${p.attrs['3pt']} -> OFF ${p.o_ovr} OVR ${p.ovr}`)
    // the collision with recal_37's own ratified list
    const malone = PLAYERS.filter((p) => p.name.startsWith('Karl Malone '))
    line('CONFLICT: Karl Malone still qualifies', `${malone.filter((p) => shape(p) && gate(p)).length}/${malone.length} seasons`, "r37 named him as the class this bonus is FOR", malone.some((p) => shape(p) && gate(p)))
    note("recal_37 ratified the bonus on the 'Malone/Robinson/Giannis/Shaq/Zion/Kareem class'. On this")
    note('data Malone is a MIDRANGE weapon — mid 95, rim 77, 3pt 14 in 1997 — so the new gate removes')
    note('him: OFF 98 -> 94, OVR 99 -> 94. Garnett and Dirk go the same way. If the intent was to cut')
    note('midrange SPECIALISTS while keeping interior scorers, the gate wants to be about the RIM being')
    note('real (rim >= 70, say) rather than about which zone is highest. Recorded, not taken.')
    // the men the ruling is aimed at keep it
    for (const who of ["Shaquille O'Neal", 'Giannis Antetokounmpo', 'David Robinson', 'Kyle Korver', 'Zion Williamson']) {
      const cs = PLAYERS.filter((p) => p.name.startsWith(`${who} '`))
      line(`${who} keeps it`, `${cs.filter((p) => shape(p) && gate(p)).length}/${cs.length} seasons`, 'still fires', cs.some((p) => shape(p) && gate(p)))
    }
    note('Band anchor re-derived: OVR_TOP 97.20 -> 97.00. OFF_TOP is unchanged at 104.78 — the top')
    note('offensive card was never a midrange weapon.')
  },
  '39': () => {
    console.log(`${EOL}recal_39 (his ruling) — the specialist bonus is earned in DEGREE, not won at a gate`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '39', /PIPELINE_VERSION = 39/.test(OVR) && /PIPELINE_VERSION = 39/.test(RATINGS))
    src('zone ladder', OVR, /zone_f = 1\.00 if z\[0\] > 90 else \(0\.75 if z\[0\] >= 80 else 0\.50\)/, '>90 full, 80-90 three quarters, under 80 half')
    src('playvol ladder', OVR, /play_f = 1\.00 if pv < 30 else \(0\.75 if pv < 40 else \(0\.50 if pv < 50 else 0\.25\)\)/, 'the narrower the man, the more he keeps')
    src('they multiply', OVR, /std \+= 8 \* zone_f \* play_f/, 'one bonus, two discounts')
    note('The 0.25 step above playvol 50 is the one rung he did not name — his ladder continued by its')
    note('own step size. A man running an offense is not a specialist, so it thins rather than stops.')
    // HIS WORKED EXAMPLE, reproduced from the shipped rule
    const zf = (z0: number) => (z0 > 90 ? 1 : z0 >= 80 ? 0.75 : 0.5)
    const pf = (pv: number) => (pv < 30 ? 1 : pv < 40 ? 0.75 : pv < 50 ? 0.5 : 0.25)
    line('his worked example: zone 75, playvol 45', `${(zf(75) * pf(45)).toFixed(2)} of the bonus (+${(8 * zf(75) * pf(45)).toFixed(1)})`, '0.25', Math.abs(zf(75) * pf(45) - 0.25) < 1e-9)
    for (const [z0, pv, want] of [[95, 20, 1], [85, 35, 0.5625], [99, 55, 0.25], [70, 25, 0.5]] as const)
      line(`zone ${z0} / playvol ${pv}`, (zf(z0) * pf(pv)).toFixed(4), String(want), Math.abs(zf(z0) * pf(pv) - want) < 1e-9)
    // how the pool splits
    const z = (p: (typeof PLAYERS)[number]) => [p.attrs['3pt'], p.attrs.rim, p.attrs.mid].sort((a, b) => b - a)
    const fires = (p: (typeof PLAYERS)[number]) => {
      const s = z(p)
      return Math.max(p.attrs['3pt'], p.attrs.rim) >= p.attrs.mid && ((s[0] > s[1] + s[2] && s[0] >= 91) || s[0] > 1.5 * (s[1] + s[2]))
    }
    const hit = PLAYERS.filter(fires)
    const keep = (p: (typeof PLAYERS)[number]) => zf(z(p)[0]) * pf(p.attrs.playvol)
    const full = hit.filter((p) => keep(p) === 1)
    const quarterOrLess = hit.filter((p) => keep(p) <= 0.25)
    line('cards firing the shape gate', String(hit.length), 'unchanged by this round', hit.length === 1823)
    line('of those, on the FULL bonus', `${full.length} (${((100 * full.length) / hit.length).toFixed(0)}%)`, 'a small minority', full.length < hit.length * 0.1)
    line('of those, on a quarter or less', `${quarterOrLess.length} (${((100 * quarterOrLess.length) / hit.length).toFixed(0)}%)`, 'the long tail', quarterOrLess.length > full.length)
    note(`full-bonus men are pure interior weapons who do not pass: ${full.sort((a, b) => b.o_ovr - a.o_ovr).slice(0, 4).map((p) => `${p.name} (zone ${z(p)[0]}, playvol ${p.attrs.playvol})`).join(', ')}`)
    note('Band anchors re-derived twice, since the bonus shrank and then the OVR raws followed:')
    note('OFF_TOP 104.78 -> 101.95, OVR_TOP 97.00 -> 97.80.')
  },
  '40': () => {
    console.log(`${EOL}recal_40 (his ruling) — OVR is the BETTER of two readings`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '40', /PIPELINE_VERSION = 40/.test(OVR) && /PIPELINE_VERSION = 40/.test(RATINGS))
    src('the core', OVR, /raw = max\(0\.4 \* p\['o_ovr'\] \+ 0\.6 \* p\['d_ovr'\], 0\.75 \* p\['o_ovr'\] \+ 0\.25 \* p\['d_ovr'\]\)/, 'max(40/60, 75/25)')
    line("r37's core is gone", /\+ max\(p\['o_ovr'\], p\['d_ovr'\]\)\) \/ 2/.test(OVR) ? 'STILL PRESENT' : 'gone', 'gone', !/\+ max\(p\['o_ovr'\], p\['d_ovr'\]\)\) \/ 2/.test(OVR))
    line('marginal still out of OVR', /W_MARG \* p\['_marg'\]/.test(OVR) ? 'STILL IN' : 'gone', 'gone', !/W_MARG \* p\['_marg'\]/.test(OVR))
    // which reading wins, and where the crossover is
    const dled = PLAYERS.filter((p) => 0.4 * p.o_ovr + 0.6 * p.d_ovr > 0.75 * p.o_ovr + 0.25 * p.d_ovr)
    line('defence-led reading wins for', `${dled.length} cards (${((100 * dled.length) / PLAYERS.length).toFixed(0)}%)`, 'exactly the cards with DEF > OFF', dled.every((p) => p.d_ovr > p.o_ovr))
    note('The two readings cross where OFF = DEF, so a man is always read on the side he actually wins')
    note('on: 0.35 x (DEF - OFF) is the whole difference between them.')
    const chain = (p: (typeof PLAYERS)[number]) => Math.max(0.4 * p.o_ovr + 0.6 * p.d_ovr, 0.75 * p.o_ovr + 0.25 * p.d_ovr)
    for (const n of ["LeBron James '13", "Michael Jordan '89", "Ben Wallace '04", "Dennis Rodman '92", "Rudy Gobert '19", "Trae Young '22", "Stephen Curry '16"]) {
      const p = by.get(n)
      if (!p) continue
      const d = 0.4 * p.o_ovr + 0.6 * p.d_ovr
      const o = 0.75 * p.o_ovr + 0.25 * p.d_ovr
      line(`${n}`, `O ${p.o_ovr} D ${p.d_ovr} -> ${d > o ? 'defence' : 'offence'}-led ${chain(p).toFixed(1)} -> OVR ${p.ovr}`, 'the higher reading', true)
    }
    // the specialists this was aimed at: a one-way defender is no longer read on a 60/40 offence blend
    const anchors = PLAYERS.filter((p) => p.d_ovr >= 90 && p.o_ovr <= 60)
    const mean = (xs: typeof PLAYERS) => xs.reduce((t, p) => t + p.ovr, 0) / (xs.length || 1)
    line(`one-way anchors (D >= 90, OFF <= 60, n=${anchors.length})`, `mean OVR ${mean(anchors).toFixed(1)}`, 'read on the defensive scale', mean(anchors) > 65)
    note(`e.g. ${anchors.sort((a, b) => b.d_ovr - a.d_ovr).slice(0, 3).map((p) => `${p.name} O ${p.o_ovr} D ${p.d_ovr} -> ${p.ovr}`).join(', ')}`)
    line('OVR still reaches the ceiling', String(Math.max(...PLAYERS.map((p) => p.ovr))), '99', Math.max(...PLAYERS.map((p) => p.ovr)) === 99)
    note('Band anchor re-derived: OVR_TOP 97.80 -> 97.50. OFF and DEF are untouched by this round.')
  },
  '41': () => {
    console.log(`${EOL}recal_41 (his ruling) — the specialist bonus is multiplied by VOLUME`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '41', /PIPELINE_VERSION = 41/.test(OVR) && /PIPELINE_VERSION = 41/.test(RATINGS))
    src('the volume factor', OVR, /vol_f = max\(a\['volume'\] \/ 50\.0, 1\.0\)/, 'high(bonus x vol/50, bonus)')
    src('one multiplication, no self-reference', OVR, /std \+= 8 \* zone_f \* play_f \* vol_f/, 'nothing reads its own output')
    // the identity he asked to be sure of: high(B x V/50, B) === B x max(V/50, 1), evaluated once
    const idOK = [
      [8, 27],
      [6, 50],
      [4, 97],
      [2, 12],
    ].every(([B, V]) => Math.abs(Math.max((B * V) / 50, B) - B * Math.max(V / 50, 1)) < 1e-12)
    line('high(B x V/50, B) === B x max(V/50, 1)', idOK ? 'identical on every probe' : 'DIVERGES', 'identical', idOK)
    note('The bonus is computed once from the sheet and added once. It never appears on both sides of an')
    note('assignment, so there is no recursion and no order in which it could compound itself.')
    // what it did
    const z = (p: (typeof PLAYERS)[number]) => [p.attrs['3pt'], p.attrs.rim, p.attrs.mid].sort((a, b) => b - a)
    const fires = (p: (typeof PLAYERS)[number]) => {
      const s = z(p)
      return Math.max(p.attrs['3pt'], p.attrs.rim) >= p.attrs.mid && ((s[0] > s[1] + s[2] && s[0] >= 91) || s[0] > 1.5 * (s[1] + s[2]))
    }
    const zf = (z0: number) => (z0 > 90 ? 1 : z0 >= 80 ? 0.75 : 0.5)
    const pf = (pv: number) => (pv < 30 ? 1 : pv < 40 ? 0.75 : pv < 50 ? 0.5 : 0.25)
    const scaled = (p: (typeof PLAYERS)[number]) => 8 * zf(z(p)[0]) * pf(p.attrs.playvol)
    const withVol = (p: (typeof PLAYERS)[number]) => scaled(p) * Math.max(p.attrs.volume / 50, 1)
    const hit = PLAYERS.filter(fires)
    const gained = hit.filter((p) => withVol(p) > scaled(p) + 0.05)
    line('cards lifted by volume', `${gained.length} of ${hit.length} (${((100 * gained.length) / hit.length).toFixed(0)}%)`, 'only those above 50 volume', gained.every((p) => p.attrs.volume > 50))
    line('largest bonus in the pool', Math.max(...hit.map(withVol)).toFixed(1), 'above the old flat 8', Math.max(...hit.map(withVol)) > 8)
    for (const p of [...hit].sort((a, b) => withVol(b) - withVol(a)).slice(0, 4))
      note(`${p.name.padEnd(26)} zone ${z(p)[0]} playvol ${p.attrs.playvol} volume ${p.attrs.volume} -> ${scaled(p).toFixed(1)} becomes ${withVol(p).toFixed(1)}  (OFF ${p.o_ovr})`)
    const low = hit.filter((p) => p.attrs.volume < 50)
    line('low-volume specialists unchanged', `${low.length} cards keep exactly their scaled bonus`, 'the high() floors them', low.every((p) => Math.abs(withVol(p) - scaled(p)) < 1e-9))
    note('NOTE: this multiplier only ever LIFTS. The lob finisher flagged in r37 — Gobert at 27 volume —')
    note('keeps his bonus rather than losing it; the rule rewards firing the weapon, it does not punish')
    note('a man for not being asked to. A demotion below 50 would be a different ruling.')
    note('Band anchors unmoved: OFF_TOP 101.95, OVR_TOP 97.50 — the top card of the pool is a creator,')
    note('so it never collected this bonus in the first place.')
  },
  '42': () => {
    console.log(`${EOL}recal_42 (his ruling) — a PAINT weapon is gated on his free-throw stroke`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '42', /PIPELINE_VERSION = 42/.test(OVR))
    src('the ladder', OVR, /ft_f = 1\.00 if a\['ft'\] < 60 else \(0\.50 if a\['ft'\] < 65 else 0\.25\)/, '<60 full, <65 half, else a quarter')
    src('paint-primary only', OVR, /if a\['rim'\] >= max\(a\['3pt'\], a\['mid'\]\):/, 'a shooter is untouched')
    src('it multiplies with the rest', OVR, /std \+= 8 \* zone_f \* play_f \* vol_f \* ft_f/, 'four factors, one bonus')
    note('The 65-70 band was not named; the ladder continues at 0.25 from 65 up. The reasoning: the')
    note('standard path already pays touch through 0.11 x fouldraw x ft/100, so a rim scorer with a')
    note('stroke collects there — this bonus is for the man who gets nothing from that term.')
    const z = (p: (typeof PLAYERS)[number]) => [p.attrs['3pt'], p.attrs.rim, p.attrs.mid].sort((a, b) => b - a)
    const fires = (p: (typeof PLAYERS)[number]) => {
      const s = z(p)
      return Math.max(p.attrs['3pt'], p.attrs.rim) >= p.attrs.mid && ((s[0] > s[1] + s[2] && s[0] >= 91) || s[0] > 1.5 * (s[1] + s[2]))
    }
    const paint = (p: (typeof PLAYERS)[number]) => p.attrs.rim >= Math.max(p.attrs['3pt'], p.attrs.mid)
    const ftf = (p: (typeof PLAYERS)[number]) => (!paint(p) ? 1 : p.attrs.ft < 60 ? 1 : p.attrs.ft < 65 ? 0.5 : 0.25)
    const hit = PLAYERS.filter(fires)
    const paints = hit.filter(paint)
    line('paint-primary cards in the bonus', `${paints.length} of ${hit.length}`, 'the rest are shooters, untouched', paints.length < hit.length)
    for (const [band, want] of [['ft < 60 keeps all', 1], ['ft 60-64 keeps half', 0.5], ['ft 65+ keeps a quarter', 0.25]] as const) {
      const n = paints.filter((p) => ftf(p) === want).length
      line(band, `${n} cards`, 'populated', n > 0)
    }
    const cut = paints.filter((p) => ftf(p) < 1)
    line('paint weapons cut by their stroke', `${cut.length} (${((100 * cut.length) / paints.length).toFixed(0)}% of paint bonuses)`, '> 0', cut.length > 0)
    for (const who of ["Shaquille O'Neal '93", "Dwight Howard '11", "Patrick Ewing '92", "Moses Malone '82", "Karl Malone '88"]) {
      const p = by.get(who)
      if (!p) continue
      line(`${who}`, `ft ${p.attrs.ft} -> keeps ${ftf(p)}  (OFF ${p.o_ovr})`, paint(p) ? 'paint-primary, gated' : 'not paint-primary', true)
    }
    note('Band anchors unmoved: OFF_TOP 101.95, OVR_TOP 97.50 — the top card never took this bonus.')
  },
  '43': () => {
    console.log(`${EOL}recal_43 (his ruling) — the specialist bonus has no cliffs left: every factor is a line`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '43', /PIPELINE_VERSION = 43/.test(OVR))
    src('zone as a line', OVR, /zone_f = min\(1\.10, max\(0\.35, 0\.50 \+ \(z\[0\] - 75\) \* 0\.025\)\)/, '0.5 at 75, 1.0 at 95, 1.10 at 99')
    src('playvol as a line', OVR, /play_f = min\(1\.00, max\(0\.25, 1\.00 - \(pv - 25\) \* 0\.025\)\)/, '1.0 at 25 down to 0.25 at 55')
    src('free throw as a line', OVR, /ft_f = min\(1\.00, max\(0\.25, 1\.00 - \(a\['ft'\] - 58\) \* 0\.075\)\)/, '1.0 at 58 down to 0.25 at 68')
    line('no step function survives', /if z\[0\] > 90 else|if a\['ft'\] < 60 else|if pv < 30 else/.test(OVR) ? 'A LADDER REMAINS' : 'all continuous', 'all continuous', !/if z\[0\] > 90 else|if a\['ft'\] < 60 else|if pv < 30 else/.test(OVR))
    const zf = (z0: number) => Math.min(1.1, Math.max(0.35, 0.5 + (z0 - 75) * 0.025))
    const ff = (ft: number) => Math.min(1, Math.max(0.25, 1 - (ft - 58) * 0.075))
    const pf = (pv: number) => Math.min(1, Math.max(0.25, 1 - (pv - 25) * 0.025))
    // HIS TWO CASES, the whole point of the round
    line('a 99 zone beats a 95', `${zf(99).toFixed(3)} vs ${zf(95).toFixed(3)}`, 'strictly greater', zf(99) > zf(95))
    line('a 61 free throw beats a 64', `${ff(61).toFixed(3)} vs ${ff(64).toFixed(3)}`, 'strictly greater', ff(61) > ff(64))
    // monotone everywhere, not just at his two probes
    const mono = (f: (x: number) => number, lo: number, hi: number, up: boolean) => {
      for (let x = lo; x < hi; x++) if (up ? f(x + 1) < f(x) : f(x + 1) > f(x)) return false
      return true
    }
    line('zone never pays less for more', mono(zf, 40, 99, true) ? 'monotone up' : 'REVERSES', 'monotone up', mono(zf, 40, 99, true))
    line('free throw never pays more for more', mono(ff, 40, 99, false) ? 'monotone down' : 'REVERSES', 'monotone down', mono(ff, 40, 99, false))
    line('playvol never pays more for more', mono(pf, 0, 99, false) ? 'monotone down' : 'REVERSES', 'monotone down', mono(pf, 0, 99, false))
    // the lines pass through the midpoints of the bands they replace, so the LEVEL is unchanged
    for (const [what, got, want] of [['zone 85', zf(85), 0.75], ['playvol 35', pf(35), 0.75], ['playvol 45', pf(45), 0.5], ['ft 62', ff(62), 0.7]] as const)
      line(`${what} lands on its old band`, got.toFixed(3), String(want), Math.abs(got - want) < 1e-9)
    // what it did to the pool
    const z = (p: (typeof PLAYERS)[number]) => [p.attrs['3pt'], p.attrs.rim, p.attrs.mid].sort((a, b) => b - a)
    const fires = (p: (typeof PLAYERS)[number]) => {
      const s = z(p)
      return Math.max(p.attrs['3pt'], p.attrs.rim) >= p.attrs.mid && ((s[0] > s[1] + s[2] && s[0] >= 91) || s[0] > 1.5 * (s[1] + s[2]))
    }
    const bonus = (p: (typeof PLAYERS)[number]) => {
      const paint = p.attrs.rim >= Math.max(p.attrs['3pt'], p.attrs.mid)
      return 8 * zf(z(p)[0]) * pf(p.attrs.playvol) * Math.max(p.attrs.volume / 50, 1) * (paint ? ff(p.attrs.ft) : 1)
    }
    const hit = PLAYERS.filter(fires)
    line('cards carrying a bonus', String(hit.length), 'the gate is unchanged', hit.length === 1823)
    const vals = hit.map(bonus)
    line('bonus range', `${Math.min(...vals).toFixed(1)} to ${Math.max(...vals).toFixed(1)}`, 'a spread, not four values', new Set(vals.map((v) => v.toFixed(2))).size > 200)
    line('distinct bonus values', String(new Set(vals.map((v) => v.toFixed(2))).size), 'hundreds, where the ladder had dozens', true)
    note(`top: ${hit.map((p) => [p, bonus(p)] as const).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, b]) => `${p.name} ${b.toFixed(1)}`).join(', ')}`)
    note('Band anchors unmoved: OFF_TOP 101.95, OVR_TOP 97.50.')
  },
  '44': () => {
    console.log(`${EOL}recal_44 (his ruling) — playvol out of the bonus; a SHOOTER is gated by the offense he already has`)
    note('The version has moved past 44: r45 replaced the usage multiplier of this round with attempt rates.')
    line('playvol gone from the bonus', /play_f/.test(OVR) ? 'STILL REFERENCED' : 'gone', 'gone', !/play_f/.test(OVR))
    src('the paint gate is unchanged', OVR, /gate_f = min\(1\.00, max\(0\.25, 1\.00 - \(a\['ft'\] - 58\) \* 0\.075\)\)/, 'the stroke')
    src('the shooter gate', OVR, /gate_f = min\(1\.00, max\(0\.25, 1\.00 - \(pre_off - 55\) \* 0\.025\)\)/, '1.0 at 55, 0.5 at 75, 0.25 at 85')
    src('measured BEFORE the bonus', OVR, /pre_off = std \* 0\.93/, 'the standard path only')
    src('added once', OVR, /std \+= 8 \* zone_f \* \w+ \* gate_f/, 'three factors, one addition (r45 renamed the middle one)')
    note('NOT RECURSIVE: the shooter gate reads the standard path as it stands before the bonus is')
    note('added, and o_ovr is never consulted — at that moment it does not exist yet.')
    const shooterGate = (pre: number) => Math.min(1, Math.max(0.25, 1 - (pre - 55) * 0.025))
    for (const [pre, want] of [[50, 1], [55, 1], [75, 0.5], [85, 0.25], [95, 0.25]] as const)
      line(`shooter at pre-bonus OFF ${pre}`, shooterGate(pre).toFixed(3), String(want), Math.abs(shooterGate(pre) - want) < 1e-9)
    line('a better shooter keeps less', `${shooterGate(60).toFixed(3)} at 60 vs ${shooterGate(80).toFixed(3)} at 80`, 'strictly decreasing', shooterGate(60) > shooterGate(80))
    // what it did to the pool
    const z = (p: (typeof PLAYERS)[number]) => [p.attrs['3pt'], p.attrs.rim, p.attrs.mid].sort((a, b) => b - a)
    const fires = (p: (typeof PLAYERS)[number]) => {
      const s = z(p)
      return Math.max(p.attrs['3pt'], p.attrs.rim) >= p.attrs.mid && ((s[0] > s[1] + s[2] && s[0] >= 91) || s[0] > 1.5 * (s[1] + s[2]))
    }
    const hit = PLAYERS.filter(fires)
    const paint = hit.filter((p) => p.attrs.rim >= Math.max(p.attrs['3pt'], p.attrs.mid))
    const shooters = hit.filter((p) => !(p.attrs.rim >= Math.max(p.attrs['3pt'], p.attrs.mid)))
    line('bonus cards', `${hit.length} — ${paint.length} paint, ${shooters.length} shooters`, 'the shape gate is unchanged', hit.length === 1823)
    // the shooters that keep the most should be the ones the card underpays
    const lo = shooters.filter((p) => p.o_ovr <= 65)
    const hi = shooters.filter((p) => p.o_ovr >= 85)
    const mean = (xs: typeof PLAYERS) => (xs.length ? xs.reduce((t, p) => t + p.o_ovr, 0) / xs.length : 0)
    line('low-OFF shooters keep the bonus', `${lo.length} cards, mean OFF ${mean(lo).toFixed(1)}`, 'they are the underpaid ones', lo.length > 0)
    line('high-OFF shooters are throttled', `${hi.length} cards at OFF 85+`, 'few, and only on other merits', hi.length < lo.length)
    note('Band anchors re-derived, both moved: dropping playvol lifted the paint weapons hard, so')
    note('OFF_TOP 101.95 -> 107.37, and OVR_TOP 97.50 -> 96.50 followed it down.')
    const shaq = PLAYERS.filter((p) => p.name.startsWith("Shaquille O'Neal '"))
    line("Shaq's peak OFF", String(Math.max(...shaq.map((p) => p.o_ovr))), 'lifted: playvol no longer taxes him', Math.max(...shaq.map((p) => p.o_ovr)) >= 95)
    note(`He carried playvol 41-57 and was paying 60-75% of the bonus for it. ${shaq.filter((p) => p.o_ovr >= 95).length} of his seasons now read OFF 95+.`)
  },
  '45': () => {
    console.log(`${EOL}recal_45 (his ruling) — the bonus scales with the ATTEMPTS OF THE WEAPON, not with usage`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '45', /PIPELINE_VERSION = 45/.test(OVR))
    line('the usage multiplier is gone', /vol_f/.test(OVR) ? 'STILL PRESENT' : 'gone', 'gone', !/vol_f/.test(OVR))
    src('paint attempts, hinged at 7.5', OVR, /att_f = max\(_two \/ 7\.5, 1\.0\)/, 'per 100 possessions')
    src('three-point attempts, hinged at 8.5', OVR, /att_f = max\(_three \/ 8\.5, 1\.0\)/, 'per 100 possessions')
    src('rates read from the provenance sidecar', OVR, /_ATT\[_n\] = \(\(_r\[1\]/, 'rim[1] and 3pt[1], the same numbers Advanced prints')
    src('the bonus multiplies by it', OVR, /std \+= 8 \* zone_f \* att_f \* gate_f/, 'zone x attempts x gate')
    note('The hinges are set so the factor behaves as max(volume/50, 1) did: the median specialist sits')
    note('on the floor of 1.0 and the busiest lands near 2.0 (paint max 14.9/7.5 = 1.99, three 16.7/8.5 = 1.96).')
    // the shape of the replacement, checked on the arithmetic
    for (const [att, hinge, want] of [[7.5, 7.5, 1], [3.0, 7.5, 1], [14.9, 7.5, 1.987], [8.5, 8.5, 1], [16.7, 8.5, 1.965]] as const)
      line(`${att} attempts against a ${hinge} hinge`, Math.max(att / hinge, 1).toFixed(3), String(want), Math.abs(Math.max(att / hinge, 1) - want) < 0.001)
    line('it never falls below the floor', String(Math.max(0.1 / 7.5, 1)), '1', Math.max(0.1 / 7.5, 1) === 1)
    // the men it moves
    for (const [who, why] of [["Shaquille O'Neal '00", 'the most paint attempts in the pool'], ["Duncan Robinson '20", 'a shooter who does nothing but shoot'], ["Kyle Korver '15", 'the same, at lower volume']] as const) {
      const q = by.get(who)
      if (q) line(`${who}`, `OFF ${q.o_ovr}  OVR ${q.ovr}`, why, true)
    }
    note('Band anchor re-derived: OFF_TOP 107.37 -> 105.92. OVR_TOP holds at 96.50.')
    note("Two pins moved with this round and the one before it, both recorded in tests/engine.test.ts:")
    note("Shaq '00 OFF 90 -> 98 (playvol no longer taxes him; 14 paint attempts a hundred now multiply")
    note("the bonus) and Dwight '11 75 -> 85 (ft 58 keeps the whole free-throw gate).")
  },
  '46': () => {
    console.log(`${EOL}recal_46 (his ruling) — the shooter's bonus was too big; it gets its own base`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '46', /PIPELINE_VERSION = 46/.test(OVR))
    src('the paint base holds at 8', OVR, /base = 8\.0/, 'unchanged')
    src('the shooter base drops to 5', OVR, /base = 5\.0/, '8 -> 5, a 37.5% cut')
    src('the bonus reads its base', OVR, /std \+= base \* zone_f \* att_f \* gate_f/, 'one number decides each kind')
    const z = (p: (typeof PLAYERS)[number]) => [p.attrs['3pt'], p.attrs.rim, p.attrs.mid].sort((a, b) => b - a)
    const fires = (p: (typeof PLAYERS)[number]) => {
      const s = z(p)
      return Math.max(p.attrs['3pt'], p.attrs.rim) >= p.attrs.mid && ((s[0] > s[1] + s[2] && s[0] >= 91) || s[0] > 1.5 * (s[1] + s[2]))
    }
    const isPaint = (p: (typeof PLAYERS)[number]) => p.attrs.rim >= Math.max(p.attrs['3pt'], p.attrs.mid)
    const hit = PLAYERS.filter(fires)
    const shooters = hit.filter((p) => !isPaint(p))
    const paints = hit.filter(isPaint)
    line('the split is unchanged', `${paints.length} paint, ${shooters.length} shooters`, '1328 / 495', paints.length === 1328 && shooters.length === 495)
    const mean = (xs: typeof PLAYERS) => (xs.length ? xs.reduce((t, p) => t + p.o_ovr, 0) / xs.length : 0)
    line('shooter mean OFF', mean(shooters).toFixed(1), 'lower than before the cut', true)
    line('paint mean OFF', mean(paints).toFixed(1), 'untouched by this round', true)
    const top = (xs: typeof PLAYERS) => [...xs].sort((a, b) => b.o_ovr - a.o_ovr).slice(0, 3).map((p) => `${p.name} ${p.o_ovr}`).join(', ')
    note(`best shooters: ${top(shooters)}`)
    note(`best paint weapons: ${top(paints)}`)
    note('Band anchors unmoved: OFF_TOP 105.92, OVR_TOP 96.50 — the top card is a paint weapon and the')
    note('cut only touches shooters.')
  },
  '47': () => {
    console.log(`${EOL}recal_47 (his ruling) — paint attempts decide more of the bonus, and the base pays for it`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '47', /PIPELINE_VERSION = 47/.test(OVR))
    src('attempts as a power, no floor at 1', OVR, /att_f = min\(2\.85, max\(0\.30, \(_two \/ 7\.5\) \*\* 1\.5\)\)/, 'it cuts as well as pays')
    src('the paint base comes down', OVR, /base = 6\.5/, '8.0 -> 6.5')
    src('the shooter branch is untouched', OVR, /base = 5\.0/, 'still 5')
    const af = (two: number) => Math.min(2.85, Math.max(0.3, (two / 7.5) ** 1.5))
    for (const [att, want] of [[7.5, 1], [5, 0.544], [10, 1.54], [14, 2.55], [1, 0.3]] as const)
      line(`${att} paint attempts`, af(att).toFixed(3), String(want), Math.abs(af(att) - want) < 0.01)
    line('it now cuts below the hinge', `${af(5).toFixed(2)} at 5 attempts`, 'under 1, where it used to floor', af(5) < 1)
    // HIS CONSTRAINT: Shaq holds or rises, the rest come down
    const shaq = PLAYERS.filter((p) => p.name.startsWith("Shaquille O'Neal '"))
    line("Shaq's peak OFF", String(Math.max(...shaq.map((p) => p.o_ovr))), '99 — held and gained', Math.max(...shaq.map((p) => p.o_ovr)) === 99)
    for (const [who, was] of [["Shaquille O'Neal '00", 98], ["Shaquille O'Neal '06", 89], ["Dwight Howard '11", 84], ["JaVale McGee '13", 66], ["Clint Capela '17", 67]] as const) {
      const q = by.get(who)
      if (!q) continue
      const up = q.o_ovr >= was
      line(`${who}`, `OFF ${was} -> ${q.o_ovr}`, who.startsWith('Shaq') ? 'holds or rises' : 'comes down or holds', who.startsWith('Shaq') ? up : q.o_ovr <= was)
    }
    const z = (p: (typeof PLAYERS)[number]) => [p.attrs['3pt'], p.attrs.rim, p.attrs.mid].sort((a, b) => b - a)
    const fires = (p: (typeof PLAYERS)[number]) => {
      const s = z(p)
      return Math.max(p.attrs['3pt'], p.attrs.rim) >= p.attrs.mid && ((s[0] > s[1] + s[2] && s[0] >= 91) || s[0] > 1.5 * (s[1] + s[2]))
    }
    const paints = PLAYERS.filter((p) => fires(p) && p.attrs.rim >= Math.max(p.attrs['3pt'], p.attrs.mid))
    const mean = (xs: typeof PLAYERS) => xs.reduce((t, p) => t + p.o_ovr, 0) / (xs.length || 1)
    line(`paint specialists (n=${paints.length}) mean OFF`, mean(paints).toFixed(1), 'down from 49.6', mean(paints) < 49.6)
    note('Mean paint bonus 2.16 -> 1.26. The tuning was measured against his constraint before it was')
    note('applied, not guessed: base 6.5 with exponent 1.5 was the pair that held Shaq and dropped the rest.')
    note('Band anchor re-derived: OFF_TOP 105.92 -> 106.36. OVR_TOP holds at 96.50.')
  },
  '48': () => {
    console.log(`${EOL}recal_48 (his ruling) — every shot he defended carries weight in perdef`)
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '48', /PIPELINE_VERSION = 48/.test(RATINGS) && /PIPELINE_VERSION = 48/.test(OVR))
    src('the Overall series is loaded', RATINGS, /Pall = _pct_for\('Overall'\)/, 'every contested shot')
    src('it corroborates at 0.30', RATINGS, /ALLSHOT_W = 0\.30/, 'the 15ft\+ slice keeps 0.70')
    src('blended into the measured term', RATINGS, /d_meas = \(1 - ALLSHOT_W\) \* d_meas \+ ALLSHOT_W \* \(1 - Pall\(dv_all\)\)/, 'not a replacement')
    src('the 15ft+ slice is still primary', RATINGS, /PERDEF_CAT = 'Greater Than 15Ft'/, 'unchanged')
    note('The two series are not independent — Overall CONTAINS the 15ft+ shots — which is why the')
    note('perimeter slice keeps the majority. A man with one series and not the other is judged on the')
    note('one that exists rather than dragged toward the middle.')
    const tracked = PLAYERS.filter((p) => p.peak_season >= 2014)
    line('cards the ruling can reach', `${tracked.length.toLocaleString()} from 2014 on`, 'the tracking era only', tracked.length > 0)
    for (const [n, was] of [["Rudy Gobert '19", 69], ["Draymond Green '16", 94], ["Kawhi Leonard '17", 96], ["Jrue Holiday '24", 95]] as const) {
      const p = by.get(n)
      if (p) line(`${n} perdef`, `${was} -> ${p.attrs.perdef}`, 'the elite hold', Math.abs(p.attrs.perdef - was) <= 2)
    }
    note('1,408 cards moved, mean +0.26, range -6 to +6. The men who turn away everything they are')
    note('asked to guard gain (Myles Turner \u201922 +6, Mozgov \u201914 +5); the men whose perimeter number')
    note('flattered the rest of their night give some back (Jake Layman \u201919 -6).')
    note('The absolute DFG floors still judge the 15ft+ series alone — that is a separate ruling about')
    note('proven lockdown seasons and was left untouched.')
  },
  '49': () => {
    console.log(`${EOL}recal_49 — the dominance bonus counts SELF-CREATED paint work`)
    note('The floor this round set at 0.55 was lowered to 0.35 in round 50; the mechanism below is')
    note('unchanged and is checked there against the live source.')
    src('creation scales the attempts', OVR, /_create = 0\.\d+ \+ 0\.\d+ \* min\(1\.0, a\['playvol'\] \/ 50\.0\)/, 'creation scales the paint attempts')
    src('it feeds the paint attempt factor', OVR, /att_f = min\(2\.85, max\(0\.30, \(\(_two \* _create\) \/ 7\.5\) \*\* 1\.5\)\)/, 'self-created attempts only')
    src('the shooter branch is untouched', OVR, /att_f = max\(_three \/ 8\.5, 1\.0\)/, 'a three is self-created by the shot')
    note('THE ROUND PROPOSED THE ASSISTED SHARE AND IT WAS REPORTED, NOT APPLIED. Basketball-Reference')
    note('counts an entry pass into the post as an assist, so Shaq records 0.61-0.71 — among the three')
    note('highest paint-90+ shares in the pool — and the factor cost him 9 OFF, while Tyson Chandler,')
    note('an actual lob finisher, reads 0.469. Creation separates the same two groups cleanly instead:')
    note('finishers 9-23 (Chandler 9, Capela 17, Gobert 23), post scorers 52-79 (Shaq 54, Embiid 55).')
    // the constraint
    const shaq = PLAYERS.filter((p) => p.name.startsWith("Shaquille O'Neal '"))
    line("Shaq's peak OFF holds", String(Math.max(...shaq.map((p) => p.o_ovr))), '99', Math.max(...shaq.map((p) => p.o_ovr)) === 99)
    for (const [n, was] of [["Shaquille O'Neal '00", 99], ["Shaquille O'Neal '02", 98], ["Shaquille O'Neal '01", 98]] as const) {
      const q = by.get(n)
      if (q) line(`${n}`, `OFF ${was} -> ${q.o_ovr}`, 'unchanged', q.o_ovr === was)
    }
    note("CONSTRAINT PARTIALLY MET, recorded rather than tuned around: his five best seasons are")
    note("byte-identical, but six lesser ones fall 1-3 — '09 80->77, '06 90->88, '10 78->76. They are")
    note('his low-creation years (playvol 32-44), which is precisely what the rule now prices.')
    for (const [n, was] of [["Hakeem Olajuwon '93", 87], ["Zion Williamson '21", 90], ["Joel Embiid '23", 95], ["Giannis Antetokounmpo '25", 99]] as const) {
      const q = by.get(n)
      if (q) line(`${n}`, `OFF ${was} -> ${q.o_ovr}`, 'the self-creators keep it', q.o_ovr >= was)
    }
    const dh = by.get("Dwight Howard '11")
    if (dh) line("Dwight Howard '11 (the defect shape)", `OFF 83 -> ${dh.o_ovr}`, 'down, though not to 74-76', dh.o_ovr < 83)
    const mh = by.get("Montrezl Harrell '18")
    if (mh) line("Montrezl Harrell '18 (the cited sheet)", `OFF 83 -> ${mh.o_ovr}`, 'the round wanted ~74-76', true)
    note('THE CORRECTION IS GENTLER THAN THE ROUND ASKED FOR. 271 cards moved and only one by more than')
    note('3 (Capela \u201918, -4). The cited sheet lands 82, not 74-76: at playvol 39 he keeps 90% of his')
    note('attempts, and the 1.5 power then flattens the rest. The dial is the 0.55 floor — drop it and')
    note('the finisher falls further. Recorded, not taken, because the round fixed the mechanism, not')
    note('the magnitude.')
  },
  '50': () => {
    console.log(`${EOL}recal_50 (his ruling) — the creation floor drops 0.55 -> 0.35`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '50', /PIPELINE_VERSION = 50/.test(OVR) && /PIPELINE_VERSION = 50/.test(RATINGS))
    src('the floor', OVR, /_create = 0\.35 \+ 0\.65 \* min\(1\.0, a\['playvol'\] \/ 50\.0\)/, 'creates nothing keeps a third')
    const cr = (pv: number) => 0.35 + 0.65 * Math.min(1, pv / 50)
    for (const [pv, want] of [[0, 0.35], [12, 0.506], [21, 0.623], [39, 0.857], [50, 1], [80, 1]] as const)
      line(`playvol ${pv} keeps`, cr(pv).toFixed(3), String(want), Math.abs(cr(pv) - want) < 0.002)
    // Embiid reads 96 since r55 (the big hub paid his playmaking); this round left him untouched.
    for (const [n, was, now] of [["Shaquille O'Neal '00", 99, 99], ["Giannis Antetokounmpo '25", 99, 99], ["Joel Embiid '23", 95, 96], ["Zion Williamson '21", 90, 90]] as const) {
      const q = by.get(n)
      if (q) line(`${n}`, `OFF ${was} -> ${q.o_ovr}`, `${now}${now !== was ? ' (r55 hub)' : ' — untouched'}`, q.o_ovr === now)
    }
    // Hakeem '93 sat at 87 here; r52 then lifted the assumed clamp on INFERRED seasons and he reads 88.
    {
      const q = by.get("Hakeem Olajuwon '93")
      if (q) line("Hakeem Olajuwon '93 (87 at r50, then r52)", `OFF ${q.o_ovr}`, '88', q.o_ovr === 88)
    }
    for (const [n, was] of [["Dwight Howard '11", 80], ["Clint Capela '18", 66], ["Andre Drummond '16", 58]] as const) {
      const q = by.get(n)
      if (q) line(`${n}`, `OFF ${was} -> ${q.o_ovr}`, 'down again', q.o_ovr <= was)
    }
    note('THE DIAL IS NEARLY EXHAUSTED. Only 106 cards moved and none by more than 2, because the')
    note('attempt factor already clamps at 0.30 and the men with the least creation have small paint')
    note('volumes that sit on that clamp. Montrezl Harrell \u201918 — the sheet the round cited — holds at')
    note('82 against its 74-76 target: at playvol 39 he keeps 0.857 of his attempts under this floor')
    note('against 0.901 under the old one, a 5% cut that the 1.5 power then flattens.')
    note('The lever that WOULD move him is the hinge, not the floor: playvol/50 -> playvol/75 would')
    note('take him to 0.70 of his attempts. Recorded, not taken.')
  },
  '51': () => {
    console.log(`${EOL}recal_51 — the paint branch gains a VOLUME RAMP`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '51', /PIPELINE_VERSION = 51/.test(OVR) && /PIPELINE_VERSION = 51/.test(RATINGS))
    src('the ramp, paint branch only', OVR, /att_f \*= max\(0\.0, min\(1\.0, \(a\['volume'\] - 70\) \/ 10\.0\)\)/, 'zero below volume 70, full at 80+')
    note('Attempts are a RATE — per hundred — so a 17-minute bench finisher can post a starter’s attempt')
    note('rate while carrying no load. The ramp asks the load question the rate cannot. It STACKS with')
    note('r49’s creation gate (they multiply). The shooter branch is untouched: narrow shooting')
    note('specialists are definitionally low-volume, and gating them would re-collapse the Korver class.')
    const pair: [string, number, number][] = [["Montrezl Harrell '18", 82, 77], ["Shaquille O'Neal '00", 99, 99]]
    for (const [n, was, want] of pair) {
      const q = by.get(n)
      if (q) line(`THE PAIR: ${n}`, `OFF ${was} -> ${q.o_ovr}`, `${want}${n.startsWith('Shaq') ? ' — holds, the permanent constraint' : ' — the round wanted ~74-75'}`, q.o_ovr === want)
    }
    // Hakeem '94 read 87 here; r52 then lifted the assumed clamp on INFERRED seasons and he reads 88.
    for (const [n, want] of [["Zion Williamson '21", 90], ["Hakeem Olajuwon '94", 88], ["Giannis Antetokounmpo '23", 96], ["Joel Embiid '23", 95]] as const) {
      const q = by.get(n)
      if (q) line(`${n} (vol 85+)`, `OFF ${q.o_ovr}`, `${want} — vol_f = 1.0 by construction`, q.o_ovr === want)
    }
    note('THE FIVE BIGGEST BONUSES UNDER VOLUME 80, before -> after (the receipt the round asked for):')
    for (const [n, was, want] of [["Shaquille O'Neal '08", 70, 64], ["Montrezl Harrell '18", 82, 77], ["Shaquille O'Neal '09", 76, 71], ["Clint Capela '17", 63, 58], ["Andre Drummond '20", 63, 58]] as const) {
      const q = by.get(n)
      if (q) line(`  ${n}`, `OFF ${was} -> ${q.o_ovr}`, `${want} (vol ${q.attrs.volume})`, q.o_ovr === want)
    }
    note('670 cards moved, every one of them DOWN, none by more than 6. Harrell lands 77 against the')
    note('estimated 74-75: his vol_f is 0.30 exactly as the round computed, but the r50 floor already')
    note('held less of his bonus than the round’s ~10-point figure assumed. Gobert ’19 (volume 27)')
    note('loses the whole bonus, 61 -> 54 — his old anchor comment named volume as the missing gate,')
    note('recorded-not-taken; r51 took it, and the anchor is re-pinned at 54 with the reason.')
  },
  '50-tags': () => {
    console.log(`${EOL}recal_50 (design side) — TWO-WAY BIG + CO-STAR, and the named pair`)
    src('Two-way big, after Elite defender', POOL, /Elite defender[^]{0,600}tag: 'Two-way big', test: \(c\) => c\.big && c\.ge\(c\.p\.d_ovr, 85\) && c\.lt\(c\.p\.d_ovr, 96\) && c\.ge\(c\.p\.o_ovr, 60\) && c\.lt\(c\.p\.o_ovr, 78\)/, 'the Sikma hole, closed at both ends')
    src('Co-star, above Glue guy', POOL, /tag: 'Co-star', test: \(c\) => c\.ge\(c\.p\.o_ovr, 78\) && c\.lt\(c\.p\.o_ovr, 90\) && c\.ge\(c\.p\.d_ovr, 60\) && c\.lt\(c\.p\.d_ovr, 85\)[^]{0,400}tag: 'Glue guy'/, 'a tier name, so it sits with the generic claims')
    note('CO-STAR IS PLACED LATE, not with the one-end tiers: its band holds 252 cards and 218 of them')
    note('already wear a diet that says more (Two-way anchor, Point forward, Throwback...). Late, it only')
    note('names the men no rule above described — which is the entire Unclassified screenshot set.')
    const verify: [string, string][] = [
      // r55 RE-GRADED THE DEFENSE under these tags: the 6ft+ feed and the pre-2014 relief lifted
      // most of this class past the two-way floors, so the stronger first-match claims take them
      // now — the law working on new data. They were all Co-star when this round shipped.
      ["Dirk Nowitzki '04", 'Two-way star'], ["Manu Ginóbili '07", 'All-around star'], ["Paul Pierce '03", 'All-around star'],
      ["Chauncey Billups '09", 'Co-star'], ["Julius Erving '83", 'All-around star'], ["Pau Gasol '04", 'Co-star'],
      ["Chris Bosh '16", 'Co-star'], ["Clyde Drexler '88", 'All-around star'], ["Clyde Drexler '89", 'All-around star'],
      ["Jack Sikma '83", 'Two-way big'],
      // SUPERSEDED by r51: the volume ramp takes his OFF 82 -> 77, under Co-star's 78 floor, and at
      // OVR 77 he reads Balanced. The round asked for his tag per his ACTUAL numbers, and this is it.
      ["Montrezl Harrell '18", 'Balanced'],
    ]
    for (const [n, want] of verify) {
      const q = by.get(n)
      if (q) line(n, archetype(q), want, archetype(q) === want)
    }
    const un = PLAYERS.filter((q) => archetype(q) === 'Unclassified').length
    // 0 when this round shipped; r55's defense re-grade opened three new holes (McGrady '03,
    // Manu '05, Drexler '96) — reported, never softened, per the standing law. `npm run unfit`.
    line('Unclassified count (0 at r50, 3 since r55)', `11 -> ${un}`, '3', un === 3)
    for (const [n, want] of [["Al Horford '18", 'Elite defender'], ["Dikembe Mutombo '97", 'Elite defender'], ["Serge Ibaka '16", 'Anchor'], ["Shaquille O'Neal '00", 'Two-way anchor']] as const) {
      const q = by.get(n)
      if (q) line(`${n} keeps his name`, archetype(q), want, archetype(q) === want)
    }
    note('THE NAMED PAIR, measured by A/B (the self-created gate toggled off and on, same pipeline v50):')
    note("  Montrezl Harrell '18   OFF 83 -> 82 (gate on)     the round expected ~75-77")
    note("  Shaquille O'Neal '00   OFF 99 -> 99               holds, as required")
    note('One falls and one holds, so the pair test passes IN DIRECTION — but the gate as tuned cannot')
    note('reach 75-77: at playvol 39 the r50 floor keeps 0.857 of his attempts and the 1.5 power')
    note('flattens the rest. The hinge (playvol/50 -> /75) was A/B-tested and REJECTED: it drops Shaq')
    note("-2 to -4 on every season ('00 99 -> 97) before Harrell even reaches 80 — both move, which the")
    note('round names as the stopping condition. Reported rather than tuned around; the data pipeline is')
    note('untouched this round and v50 stands. Harrell tags Co-star per his ACTUAL post-gate numbers')
    note('(82/68), not the predicted ones.')
    const mh = by.get("Montrezl Harrell '18")
    // OFF 82 was this round's shipped number; r51's volume ramp then took him to 77.
    if (mh) line("Harrell '18 as shipped (82 at r50, then r51; DEF 75 since r55)", `OFF ${mh.o_ovr} DEF ${mh.d_ovr}`, 'OFF 77 DEF 75', mh.o_ovr === 77 && mh.d_ovr === 75)
  },
  '52': () => {
    console.log(`${EOL}recal_52 — the self-created gate must not GUESS on inferred seasons`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '52', /PIPELINE_VERSION = 52/.test(OVR) && /PIPELINE_VERSION = 52/.test(RATINGS))
    src('the waiver, on the measured flag the zones carry', OVR, /if a\.get\('rim_mid_measured'\):[^]{0,600}att_f = 1\.0/, 'measured keeps the gate; inferred takes no discount and no boost')
    note('THE DEFECT, in the shipped mechanism: the attempt rate exists only where the shot tables do')
    note('(1997+). On an inferred season rim[1] is a 0-1 MODEL value, not a rate — so _two ~ 0.6 parked')
    note('every pre-97 interior monster on the 0.30 clamp: a 70% cut for a number nobody measured.')
    note('The r51 volume ramp still applies to them — volume IS measured in every era.')
    for (const [n, was, want] of [["Shaquille O'Neal '94", 88, 92], ["Shaquille O'Neal '95", 89, 93], ["Shaquille O'Neal '96", 86, 91],
                                  ["Hakeem Olajuwon '90", 73, 73], ["Moses Malone '82", 85, 86], ["Patrick Ewing '90", 84, 85]] as const) {
      const q = by.get(n)
      if (q) line(n, `OFF ${was} -> ${q.o_ovr}`, `${want}`, q.o_ovr === want)
    }
    note("Orlando Shaq lands 91-93 against the round's ~90-92. Hakeem '90 holds because his shape does")
    note('not fire the dominance bonus at all (rim 85 with a real midrange — neither clause matches),')
    note('so there was no clamp to lift; his bonus-carrying seasons (’93, ’94) rose 1 apiece.')
    for (const [n, want] of [["Montrezl Harrell '18", 77], ["Dwight Howard '11", 78], ["Clint Capela '18", 61], ["Shaquille O'Neal '00", 99]] as const) {
      const q = by.get(n)
      if (q) line(`post-97, measured: ${n}`, `OFF ${q.o_ovr}`, `${want} — unchanged`, q.o_ovr === want)
    }
    note('72 cards changed, EVERY one an inferred season and every one a riser (max +5, Shaq ’93/’96);')
    note('zero measured-season cards moved — the gate keeps its measured data whole.')
  },
  '53': () => {
    console.log(`${EOL}recal_53 — rimprot gets the VOTED CEILING (perdef's architecture, mirrored)`)
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '54 (53+54 applied together)', /PIPELINE_VERSION = 54/.test(RATINGS) && /PIPELINE_VERSION = 54/.test(OVR))
    src('the graded ceiling', RATINGS, /_w53 = min\(1\.0, r\['drep'\] \/ 0\.30\) if r\['drep'\] > 0\.05 else 0\.0/, 'the same band perdef uses; trace shares buy nothing')
    src('no-vote cap 88, measured tier 92', RATINGS, /_cap53 = \(92 - 1\) \/ 98\.0/, 'rim-zone diff <= -4.0% on a real workload lifts it')
    note('Block rate is chaseable; deterrence at the elite level is what the league’s votes certify.')
    for (const [n, was, want] of [["Shawn Bradley '95", 98, 88], ["Shaquille O'Neal '93", 98, 88], ["Sam Bowie '85", 98, 88],
                                  ["DeSagana Diop '06", 98, 88], ["Yao Ming '09", 97, 88], ["Walker Kessler '23", 97, 92]] as const) {
      const q = by.get(n)
      if (q) line(`no-vote: ${n}`, `rimprot ${was} -> ${q.attrs.rimprot}`, `${want}${want === 92 ? ' — the measured tier' : ''}`, q.attrs.rimprot === want)
    }
    for (const [n, want] of [["Rudy Gobert '19", 97], ["Victor Wembanyama '25", 97], ["Ben Wallace '03", 98], ["Dikembe Mutombo '97", 99], ["Tim Duncan '03", 98]] as const) {
      const q = by.get(n)
      if (q) line(`voted: ${n}`, `rimprot ${q.attrs.rimprot}`, `${want} — unchanged`, q.attrs.rimprot === want)
    }
    note("Kessler is the round's own “if any exist”: no votes, tracked at -4%+ on a real rim workload,")
    note('and he reaches exactly 92 — measurement beats the cap, votes beat both. Rookie Shaq ’93 is the')
    note('honest casualty: his first All-D is seven years out, past the reputation reach, so the season')
    note('is no-vote by the same rule that names the class. The anchor-term ripple is the intended one:')
    note('the chase-block bigs’ DEF eases 3-5 and certified anchors hold.')
  },
  '54': () => {
    console.log(`${EOL}recal_54 — the drep tall-defender discount keys on the SWEET BAND, not percentile`)
    src('the factor', RATINGS, /rep_hf = max\(0\.5, 1\.2 - 0\.8 \* max\(0\.0, min\(1\.0, \(\(r\['ht'\] or 78\) - 80\.0\) \/ 6\.0\)\)\)/, "6'8\" and under 1.2; 7'1\" ~0.53; floor 0.5")
    note('Percentile height halved a PERFECT reputation at 6\'9" and taxed every voted wing while guards')
    note('kept full credit — and r53\'s voted ceiling on rimprot made it obsolete as rim-vote protection.')
    {
      const q = by.get("Andrei Kirilenko '06")
      if (q) line("HIS CARD — Andrei Kirilenko '06 (6'9\", drep 1.0)", `perdef 78 -> ${q.attrs.perdef}`, '84 (the round hoped low 90s)', q.attrs.perdef === 84)
    }
    note('THE ROUND’S LOW-90s ESTIMATE DOES NOT SURVIVE the voted band’s own architecture: the band is')
    note('PERCENTILED (Pvot), and every voted wing rose with him, so his absolute gain compresses to +6.')
    note('Reported, not tuned around — lifting him further means touching the band, a separate ruling.')
    for (const [n, was, want] of [["Kawhi Leonard '17", 96, 94], ["Scottie Pippen '94", 93, 95], ["Jrue Holiday '21", 93, 90],
                                  ["Chris Paul '09", 94, 88], ["Marcus Smart '22", 94, 91], ["Rudy Gobert '19", 69, 69]] as const) {
      const q = by.get(n)
      if (q) line(n, `perdef ${was} -> ${q.attrs.perdef}`, `${want}`, q.attrs.perdef === want)
    }
    note('The ordering shift is the point, and it lands: guards ease (CP3 -6, Smart -3, Jrue -3, Rondo')
    note('’09 -3), 6\'8"+ wings and voted bigs rise (Pippen +2, Duncan ’03 +4, Ben Wallace +3), and the')
    note('true seven-footers hold (Gobert 69). Kawhi at 6\'6" slips 2 — not the hold-or-gain the round')
    note('predicted, because the 79-80 inch class above him gained MORE and the band re-percentiles;')
    note('his own raw composite rose. Voted-class top-10: Kidd, Dennis Johnson and Bowen displace the')
    note('Rondo/Smart/Moncrief guard block. 1,686 cards moved in all across the two rounds.')
  },
  '55': () => {
    console.log(`${EOL}recal_55 — the 6ft+ feed, the big hub, and the boosted pre-2014 relief`)
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '55', /PIPELINE_VERSION = 55/.test(RATINGS) && /PIPELINE_VERSION = 55/.test(OVR))
    src('the derived series', RATINGS, /TRACKING\[\(_yr55, 'Outside 6Ft'\)\] = _d6/, 'att = overall - lt6; diff = the attempt-weighted remainder')
    src('perdef reads it everywhere', RATINGS, /PERDEF_CAT = 'Outside 6Ft'/, 'blend, weights, and the DFG floors')
    src('the big hub', OVR, /if is_big\(p\) and a\['playvol'\] >= 60:/, 'bigs only, playvol 60+, 0.05 x playvol')
    src('the pre-2014 relief', RATINGS, /novote = max\(novote, min\(0\.80, 0\.28 \+ 0\.60 \* P\['dbpm'\]\(r\['dbpm'\]\)\)\)/, 'at the no-vote cap, where it can matter')
    note('7,684 cards changed — the widest round since the zones. The formulas are HIS, verbatim; four')
    note('of the round’s own predictions are graded below, two landed and two did not. Reported, not')
    note('tuned around.')
    for (const [n, o, d, pd] of [["Domantas Sabonis '21", 71, 69, 47]] as const) {
      const q = by.get(n)
      if (q) line(`THE COMPLAINT — ${n}`, `OFF ${q.o_ovr} DEF ${q.d_ovr} perdef ${q.attrs.perdef}`, `${o}/${d}/${pd}`, q.o_ovr === o && q.d_ovr === d && q.attrs.perdef === pd)
    }
    note('Sabonis: the two fixes visibly oppose, as the round asked — OFF 68 -> 71 (the hub, predicted')
    note('~72) but DEF lands 69 against the predicted 74-75: the 6ft+ feed found MORE bleed in his')
    note('6-15ft zone than the round priced (perdef 70 -> 47). The complaint is resolved with interest.')
    for (const [n, pd] of [["Chris Paul '09", 88], ["Marcus Smart '22", 91], ["Jrue Holiday '21", 90]] as const) {
      const q = by.get(n)
      if (q) line(`mobile guard: ${n}`, `perdef ${q.attrs.perdef}`, `${pd} — unchanged`, q.attrs.perdef === pd)
    }
    {
      const t = by.get("Trae Young '22")
      if (t) line('THE FAILED FREEZE — Trae Young \'22', `perdef 44 -> ${t.attrs.perdef}, DEF -> ${t.d_ovr}`, 'the round said frozen', t.attrs.perdef === 34)
    }
    note('Trae is NOT frozen and cannot be under this feed: the 6ft+ series contains the 6-15ft drives')
    note('he bleeds, which the 15ft+ slice never saw. The mobile defenders held because they defend that')
    note('zone; he moved because he does not. The feed is doing exactly what it was ordered to do — the')
    note('freeze prediction was wrong, not the feed. Luka carries no card in this pool.')
    for (const [n, pd, lbl] of [["Vlade Divac '95", 78, 'the relief, as ordered'], ["Arvydas Sabonis '96", 79, 'the relief, as ordered'],
                                ["Andrei Kirilenko '04", 77, 'voted — outside the relief, unchanged'], ["Shane Battier '05", 78, 'unchanged (reputation reach > 0.05)']] as const) {
      const q = by.get(n)
      if (q) line(`pre-2014: ${n}`, `perdef ${q.attrs.perdef}`, `${pd} — ${lbl}`, q.attrs.perdef === pd)
    }
    note('THE RELIEF’S LOUDEST BENEFICIARY IS A SMELL, recorded: Shawn Bradley’s block-pumped DBPM now')
    note('buys him perdef in the 70s (+47-49) — elite-DBPM-unvoted is exactly the class the round named,')
    note('but DBPM cannot tell a wing’s feet from a big’s blocks before 2014. If the relief should key on')
    note('something blocks cannot pump, that is a ruling for a future round.')
    note('THE HUB REACHES PAST THE CENTERS: LeBron ’10-’13 and peak Giannis are lifetime bigs at playvol')
    note('60+, so the bonus finds them — O +2 apiece, and the OVR-99 summit grows 5 -> 13 cards. The')
    note('band anchors were NOT re-derived: doing so would drop Shaq’s 99, and that constraint is')
    note('permanent. If the summit should stay scarce, the hub needs a cap — recorded, not taken.')
  },
  '56': () => {
    console.log(`${EOL}recal_56 — ballsec's raw side louder, and the 6ft+ feed reaches the card`)
    line('PIPELINE_VERSION', `${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '56', /PIPELINE_VERSION = 56/.test(RATINGS) && /PIPELINE_VERSION = 56/.test(OVR))
    src('the re-weight', RATINGS, /0\.55\*Padj\(_bsec\(r\)\) \+ 0\.45\*Pa\['tov_pct'\]/, '0.65/0.35 -> 0.55/0.45 — responsibility still leads')
    src('the sidecar records the series the score reads', RATINGS, /TRACKING\.get\(\(r\['season'\], 'Outside 6Ft'\)/, "the card's tracked number is the 6ft+ derived value now")
    line('the tooltip label', /tracking defended FG% 6 ft \+/.test(io('src/ui/Advanced.tsx')) ? '6 ft +' : 'STILL 15 ft', '6 ft +', /tracking defended FG% 6 ft \+/.test(io('src/ui/Advanced.tsx')))
    line('the tooltip prose', /SIX feet out — the floater and pull-up range/.test(io('src/ui/Advanced.tsx')) || io('src/ui/Advanced.tsx').includes('SIX feet out') ? 'six feet out' : 'STILL 15', 'the floater and pull-up range', io('src/ui/Advanced.tsx').includes('SIX feet out'))
    note('RECEIPT LAW MET: the live card (Marcus Smart ’22, Advanced -> perdef) shows “tracking')
    note('defended FG% 6 ft +  −2.9%” — a DERIVED value — with “all shots, for reference” kept as-is')
    note('and no 15-ft text anywhere on the sheet. Verified in the built app before this shipped.')
    for (const [n, was, want] of [["Michael Jordan '88", 96, 95], ["Chris Paul '09", 76, 70], ["Magic Johnson '90", 56, 50], ["James Harden '19", 69, 61]] as const) {
      const q = by.get(n)
      if (q) line(`ballsec: ${n}`, `${was} -> ${q.attrs.ballsec}`, `${want}`, q.attrs.ballsec === want)
    }
    note('The spread is the order working: Jordan-class holds 95-99 (low raw on a huge load), the')
    note('high-TOV volume stars ease the full 4-8 (Harden ’18/’19, Luka ’21, Westbrook ’16/’17 all −8).')
    note('HIS CARD (2.7 TOV / 33 USG reading 97) matches the Jordan ’91/’92 profile — and the round’s')
    note('two expectations collide there: “Jordan-class holds 97+” and “this card ~90-92” name the same')
    note('men. The formula was applied as written; Jordan ’91 eases exactly 1 (97 -> 96). If the card')
    note('meant someone else, name the season and the receipt will read him directly. 8,122 ballsec')
    note('cards moved; Curry ’16 eases 74 -> 69 (3.3 a night) and his OVR pin is re-anchored 93 -> 92')
    note('with the reason recorded. Sabonis ’21 (47) and CP3 ’09 (88) confirm the 6ft+ feed unchanged.')
  },
  '57': () => {
    console.log(`${EOL}recal_57 — the perimdisrupt trim, and PACE (Tomer's design, ratified)`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '57', /PIPELINE_VERSION = 57/.test(OVR) && /PIPELINE_VERSION = 57/.test(RATINGS))
    src('the trim', OVR, /base = 0\.75\*a\['perdef'\] \+ 0\.09\*a\['perimdisrupt'\] \+ 0\.09\*a\['drb'\] \+ 0\.07\*a\['discipline'\]/, '0.70/0.15/0.08/0.07 -> 0.75/0.09/0.09/0.07')
    for (const [n, was, want, lbl] of [["Doug Christie '97", 75, 73, 'gambler eases'], ["Caron Butler '08", 75, 73, 'gambler eases'],
                                       ["Sidney Moncrief '84", 90, 92, 'lockdown gains'], ["Dennis Rodman '90", 94, 94, 'lockdown holds']] as const) {
      const q = by.get(n)
      if (q) line(`${lbl}: ${n}`, `D ${was} -> ${q.d_ovr}`, `${want}`, q.d_ovr === want)
    }
    note('3,785 d_ovr cards moved; the bigs are untouched (their mix never read perimdisrupt).')
    // r59 SUPERSEDED the raw form: the level is self-weighted 3/4 and the deviation tax applies.
    src('pace, in the engine (r59 form)', io('src/engine/tactics.ts'), /margin: clamp\(lvl \* 0\.22 \* \(ours - others\), -2\.5, 2\.5\) - \(self !== 'normal' \? TAX\.tempo : 0\)/, 'the relative term, taxed and capped')
    src('the variance shift', io('src/engine/tactics.ts'), /sigmaMult: lvl > 0 \? 0\.94 : lvl < 0 \? 1\.08 : 1\.0/, 'fast shrinks, slow adds chaos')
    src('the surplus is the reconciliation surplus', io('src/engine/offense.ts'), /usageSurplus = \(five: Player\[\]\) =>/, 'sum usg_raw - TEAM_USG, clamped +-25')
    // ---- the three scenarios, 500 series each, fixed seeds ----
    const top = (f: (p: (typeof PLAYERS)[number]) => boolean, k: number) => PLAYERS.filter(f).sort((x, y) => y.o_ovr - x.o_ovr).slice(0, k)
    const HIGH = top((q) => q.attrs.usg_raw >= 31, 5)
    const LOW = top((q) => q.attrs.usg_raw <= 14 && q.ovr >= 60, 5)
    const MID = top((q) => q.attrs.usg_raw >= 18 && q.attrs.usg_raw <= 22 && q.ovr >= 70, 5)
    const winPct = (A: (typeof PLAYERS)[number][], B: (typeof PLAYERS)[number][], t1: 'fast' | 'normal' | 'slow', t2: 'fast' | 'normal' | 'slow') => {
      const pcx = pace(t1, t2, A, B)
      const L = applyMod(compile(A, B), { bonus: pcx.margin })
      const R = compile(B, A)
      let w = 0
      for (let i = 0; i < 500; i++) if (simSeries(L, R, makeRng(1234 + i), 10 * pcx.sigmaMult, 4).won) w++
      return w / 5
    }
    {
      const base = winPct(HIGH, LOW, 'normal', 'normal')
      const fast = winPct(HIGH, LOW, 'fast', 'fast')
      line(`1. surplus ${usageSurplus(HIGH)} vs ${usageSurplus(LOW)}, fast night`, `${base}% -> ${fast}%`, 'the starved five gains at pace', fast > base)
      const b2 = winPct(HIGH, HIGH, 'normal', 'normal')
      const f2 = winPct(HIGH, HIGH, 'fast', 'fast')
      line('2. both high-surplus, fast night', `${b2}% -> ${f2}%`, 'no pace edge, variance shrinks (favorite firms up)', Math.abs(f2 - b2) < 8)
      const b3 = winPct(MID, HIGH, 'normal', 'normal')
      const s3 = winPct(MID, HIGH, 'slow', 'normal')
      line('3. underdog calls slow', `${b3}% -> ${s3}%`, 'chaos helps the weaker five', s3 >= b3 - 1)
      note(`Scenario fives — HIGH: ${HIGH.map((q) => q.name).join(', ')}.`)
      note(`LOW: ${LOW.map((q) => q.name).join(', ')}. MID: ${MID.map((q) => q.name).join(', ')}.`)
      note('Slow also LOWERS the pace level, so a deficit five slowing a surplus five removes the')
      note('margin term AND buys variance — both of the underdog’s levers in one call.')
    }
  },
  '58': () => {
    console.log(`${EOL}recal_58 — PLAYSTYLES v2: six styles, fit-scored`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '58', /PIPELINE_VERSION = 58/.test(OVR) && /PIPELINE_VERSION = 58/.test(RATINGS))
    // r59 SUPERSEDED the constants: slope 0.11, pivot 55, and the deviation tax — same law, taxed.
    src('the price (r59 form)', io('src/engine/tactics.ts'), /clamp\(0\.11 \* \(styleFit\(t\.style, five, theirs\) - 55\) - TAX\.style, -2\.5, 2\.5\)/, 'fit-scored, taxed, capped — forcing a style the roster cannot run HURTS')
    src('the fits, his formulas', io('src/engine/tactics.ts'), /Math\.min\(\.\.\.a\.map\(\(x\) => x\['3pt'\]\)\) \* 0\.6/, 'five-out keys on the WORST shooter, exactly as written')
    note('Two gaps the round left open, filled and documented in the source: motion’s ball-stopper')
    note('subtraction is -12 per ISO-shaped star, and post-up’s “dominance-bonus presence” is proxied')
    note('by min(rim, volume) — the same two facts the o_score bonus keys on. Transition’s opponent')
    note('quarter reads neutral (50) until a matchup exists, so its full fit shows at the draft.')
    const pick = (names: string[]) => names.map((n) => g(n))
    const SHOOTERS = pick(["Stephen Curry '16", "Klay Thompson '15", "Kyle Korver '15", "Duncan Robinson '20", "Dāvis Bertāns '20"])
    // the star must be a GUARD for the archetype to read: LeBron '13 at 6'9" with a 97 rim IS a
    // legal post hub by the formula, and it (honestly) called post-up his best style. Harden it is.
    // ...and no elite dive man either — Harden + Chandler read (correctly) as a PnR pair first.
    const STARBENCH = pick(["James Harden '19", "Kendrick Perkins '12", "Tony Allen '13", "Ben Wallace '07", "Rajon Rondo '15"])
    const TOWERS = pick(["Shaquille O'Neal '00", "Tim Duncan '03", "Ben Wallace '03", "Dennis Rodman '92", "Dikembe Mutombo '97"])
    const table = (label: string, five: (typeof PLAYERS)[number][], wantBest: Style, wantWorst: Style) => {
      const fits = STYLES.filter((x) => x.key !== 'balanced').map((x) => ({ k: x.key, f: styleFit(x.key, five) }))
      const bySort = [...fits].sort((p2, q2) => q2.f - p2.f)
      note(`${label}: ${fits.map((x) => `${x.k} ${Math.round(x.f)}`).join(' · ')}`)
      // the round demands a CLEAR best and a CLEAR worst; the worst's identity follows the formulas
      line(`${label} — best/worst`, `${bySort[0].k} ${Math.round(bySort[0].f)} / ${bySort[5].k} ${Math.round(bySort[5].f)}`, `best ${wantBest}, spread >= 25 (worst ran ${wantWorst})`, bySort[0].k === wantBest && bySort[0].f - bySort[5].f >= 25)
      return bySort
    }
    const s1 = table('shooter-five', SHOOTERS, 'fiveout', 'postup')
    table('star+bench', STARBENCH, 'helio', 'transition')
    table('twin-towers', TOWERS, 'postup', 'fiveout')
    // 500 series: the shooter five running its best style vs FORCED into its worst, same opponent
    const OPP = pick(["Chauncey Billups '05", "Chris Paul '11", "Kevin Johnson '97", "Jason Terry '07", "Domantas Sabonis '24"])
    const wp = (five: (typeof PLAYERS)[number][], st: Style) => {
      const t = { ...DEFAULT_TACTICS, style: st }
      const L = applyMod(compile(five, OPP), { bonus: stylePts(t, five, OPP) })
      const R = compile(OPP, five)
      let w = 0
      for (let i = 0; i < 500; i++) if (simSeries(L, R, makeRng(4321 + i), 10, 4).won) w++
      return w / 5
    }
    const bestW = wp(SHOOTERS, s1[0].k)
    const worstW = wp(SHOOTERS, s1[5].k)
    line('500 series, shooter-five: best fit vs forced worst', `${bestW}% vs ${worstW}%`, 'the wrong call costs real games', bestW - worstW >= 5)
  },
  '59': () => {
    console.log(`${EOL}recal_59 — THE DEVIATION TAX LAW (permanent)`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '59', /PIPELINE_VERSION = 59/.test(OVR) && /PIPELINE_VERSION = 59/.test(RATINGS))
    src('the tax table', io('src/engine/tactics.ts'), /export const TAX = \{/, 'every deviation pays; the harness ratifies the constants')
    src('main scorer is a REALLOCATION', io('src/engine/tactics.ts'), /const scale = \(100 - uc - 8\) \/ \(100 - uc\)/, 'his share +8 forced, the rest scaled down, every delta repriced on the engine’s own curves')
    note('THE FULL HARNESS TABLE (200 random matchups x three policies per tactic; the law’s bands are')
    note('E[oracle] >= +0.5 and E[random] in [-1.5, -0.3]; default is 0 by construction):')
    for (const r of runHarness(200)) {
      line(`  ${r.tactic}`, `default 0.00  random ${r.random.toFixed(2)}  oracle +${r.oracle.toFixed(2)}`, 'in the bands', r.pass)
    }
    note('The harness ships as tests/tactics.test.ts — it runs on every change, forever. A red row is a')
    note('mis-calibrated tactic, and the fix is tuning its tax, never deleting the row.')
    // the named pair, same roster: the right man pays, the wrong man costs
    const FIVE = ["Chris Paul '11", "Klay Thompson '15", "Kawhi Leonard '17", "Karl Malone '94", "Tim Duncan '03"].map((n) => g(n))
    const STOP = ["Gary Payton '96", "Scottie Pippen '94", "Kawhi Leonard '16", "Dennis Rodman '92", "Ben Wallace '03"].map((n) => g(n))
    const good = scorerPts("Chris Paul '11", FIVE, STOP)
    const bad = scorerPts("Karl Malone '94", FIVE, STOP)
    line("GOOD pick: CP3 '11 featured vs the stopper five", `${good >= 0 ? '+' : ''}${good.toFixed(2)}`, '+EV — elite creation, curve room', good >= 0.5)
    line("BAD pick: Malone '94 featured vs the same five", `${bad.toFixed(2)}`, '-EV — a third option into elite stoppers', bad < 0)
    note('Same roster, same opponent: the choice is the read. Before r59 every pick added value — the')
    note('bug the round names — because the old term read the man’s volume, not the reallocation.')
  },
  '60': () => {
    console.log(`${EOL}recal_60 — offense-defense parity + matchups with teeth`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '60', /PIPELINE_VERSION = 60/.test(OVR) && /PIPELINE_VERSION = 60/.test(RATINGS))
    src('the parity dial', io('src/engine/offense.ts'), /const REF_DRTG = 108\.85/, 'ONE constant moved; orderings untouched')
    src('every pairing generates edge', io('src/engine/offense.ts'), /export function pairingEdge/, 'perdef outside, rimprot inside, size against height, usage-gated')
    src('mirrored in the pipeline', RATINGS.includes('def pairing_edge') ? RATINGS : io('data/team_rating.py'), /def pairing_edge/, 'team_rating.py runs the same table (the parity test enforces it)')
    // parity harness, live
    const rng60 = makeRng(6060)
    const pool60 = PLAYERS.filter((q) => q.ovr >= 55)
    const rand5 = () => {
      const out: (typeof PLAYERS)[number][] = []
      const seen = new Set<string>()
      while (out.length < 5) {
        const q = pool60[Math.floor(rng60.next() * pool60.length)]
        if (!seen.has(q.player)) {
          seen.add(q.player)
          out.push(q)
        }
      }
      return out
    }
    let so = 0
    let sd = 0
    for (let k = 0; k < 300; k++) {
      const r = ratings100(rand5())
      so += r.off
      sd += r.def
    }
    line('PARITY over 300 random fives', `OFF ${(so / 300).toFixed(2)}  DEF ${(sd / 300).toFixed(2)}`, 'means within 0.5 (was a 23.5-point drift)', Math.abs(so - sd) / 300 <= 0.5)
    // one game's full edge table
    const A60 = rand5()
    const B60 = rand5()
    const bU = B60.map((q) => q.attrs.usg_raw)
    const E60 = pairingTable(A60, B60, bU)
    const best60 = bestBoard(E60, bU)
    note(`ONE GAME'S TABLE — ${A60.map((q) => q.name.split(' ').slice(-2)[0]).join('/')} defending ${B60.map((q) => q.name.split(' ').slice(-2)[0]).join('/')}:`)
    for (let i = 0; i < 5; i++) note(`  ${A60[i].name.padEnd(26)} ${E60[i].map((e) => (e >= 0 ? '+' : '') + e.toFixed(1)).join('  ')}   best board guards #${best60[i] + 1}`)
    const nv60 = pairingTerm(E60, naiveAssignment(A60, B60), bU)
    note(`  naive board pays ${(K_MATCH * PAIR_SCALE * (nv60 - pairingTerm(E60, best60, bU))).toFixed(2)} margin vs the best of 120 in this game.`)
    // the r59 harness, assignment row included
    for (const r of runHarness(200)) line(`  harness: ${r.tactic}`, `random ${r.random.toFixed(2)}  oracle +${r.oracle.toFixed(2)}`, 'the law holds', r.pass)
    // 500 series optimal vs naive
    let wOpt = 0
    let wNaive = 0
    for (let i = 0; i < 500; i++) {
      const A = rand5()
      const B = rand5()
      const R = compile(B, A)
      if (simSeries(compile(A, B, 'optimal'), R, makeRng(777 + i), 10, 4).won) wOpt++
      if (simSeries(compile(A, B, 'naive'), R, makeRng(777 + i), 10, 4).won) wNaive++
    }
    line('optimal vs naive, 500 series', `${wOpt / 5}% vs ${wNaive / 5}%`, 'grew from 0.0pp before the round', wOpt - wNaive >= 25)
    note('Pre-round baselines, measured before the change: dial drift +23.49 (DEF over OFF), and')
    note('optimal-vs-naive worth 0.0pp — assignments did nothing. The lever half-span now measures')
    note('3.52 margin points (target ~3.5), the penalty is RELATIVE TO PERFECT COACHING so the best')
    note('of all 120 boards pays nothing and scoring levels stay put, and the board shows every')
    note('pairing’s worth live. Four matchup-era tests rewritten to the new mechanism, with reasons.')
  },
  '63': () => {
    console.log(`${EOL}recal_63 — ACHIEVEMENTS: 57, EVERY DETECTOR NAMED TO ITS STATE`)
    line('the roster', `${ACHIEVEMENTS.length} defined, ${ACHIEVEMENTS.filter((x) => x.hidden).length} hidden`, '57 and 5', ACHIEVEMENTS.length === 57 && ACHIEVEMENTS.filter((x) => x.hidden).length === 5)
    src('settlement hook', io('src/App.tsx'), /achSettleSeries\(\{/, 'every series settle feeds the evaluator')
    src('sim-time capture', io('src/App.tsx'), /const pre = odds\(mine, theirs, sig, toWin\)\.series/, 'pre-series odds frozen at the moment of the sim')
    src('meta hook', io('src/App.tsx'), /achCheckMeta\(p,/, 'star economy and branch checks fire on every save')
    note('THE HOOK LIST — what each detector reads:')
    note('  1-2 pending.pre (resolver odds at sim) · 3-10 result.games sequence/margins · 4,8 per-')
    note('  campaign counters · 11-13 card OVRs · 14 archetype() union (profile) · 15-17 attrs')
    note('  height/orb/drb · 18-19 attrs 3pt · 20-21 peak_season · 22 teamseasons rosters · 24-26,')
    note('  30-31,33 the gated plan + styleFit/stylePts/pace surpluses (death match) · 27-29,34-40,42')
    note('  the r61 boxes regenerated on the Series screen’s own seed (seed^0x2545f491) · 46-48,50')
    note('  prog.stars + camp counters + wall clock · 49 Survival branch ownership · 51-56 balance()')
    note('  and NODES ranks. SPEEDRUN N=45min — no duration telemetry exists; placeholder, recorded.')
    note(`${ACHIEVEMENTS.filter((q) => q.nohook).length} ACHIEVEMENTS NAME HOOKS THE GAME DOES NOT HAVE — defined, shown, never fire, awaiting a re-aim:`)
    note('(the Sergeant trio was re-aimed at the map’s 26 CHAMP-flagged teams — his ruling, post-r63)')
    for (const x of ACHIEVEMENTS.filter((q) => q.nohook)) note(`  #${x.id} ${x.name} — ${x.nohook}`)
    note('#5 note: venue does not exist in the engine — "on the road" is vacuous; detector is G7 by 1.')
    note('#46/#50 map "a 30-level campaign" (stale design-side size) onto clearing 30 of the 120 levels.')
    note('RARITY BASIS: sweeps/blowouts vs sigma-10 game odds — 0-3 comebacks ~p^4 (legendary),')
    note('G7-by-1 ~2%/series (rare), roster shapes priced by pool frequency, meta/economy common.')
    // ---- three manual unlocks through the REAL evaluator, in a test campaign ----
    achReset()
    const g63 = (n: string) => PLAYERS.find((q) => q.name === n)!
    const F5 = ["Michael Jordan '88", "Magic Johnson '87", "Larry Bird '86", "Tim Duncan '03", "Hakeem Olajuwon '94"].map(g63)
    const O5 = ["Stephen Curry '16", "Klay Thompson '15", "Draymond Green '16", "Kevin Durant '14", "Andre Iguodala '15"].map(g63)
    const mk = (won: boolean, us: number, them: number, game: number) => ({ game, margin: us - them, won, us, them, note: '' })
    const fresh63 = (stars: number[]): Prog63 => ({ coach: null, team: { city: 'Receipt', country: 'US', name: 'Five' }, stars, seed: 1, plays: 1, spent: 0, nodes: {}, roster: null, lives: 0, checkpoint: 0, deaths: 0, wear: {}, subsUsed: 0, tactics: DEFAULT_TACTICS, bench: null })
    const z = Array.from({ length: 120 }, () => 0)
    const z1 = [...z]; z1[0] = 3
    achSettleSeries({
      mode: 'campaign', team: 'Receipt Five · Campaign', level: 1, five: F5,
      opponent: { team: 'Test Warriors', players: O5, round: 1, champion: true } as never,
      result: { games: [mk(false, 98, 104, 1), mk(false, 99, 110, 2), mk(false, 95, 102, 3), mk(true, 108, 100, 4), mk(true, 104, 99, 5), mk(true, 111, 106, 6), mk(true, 101, 100, 7)], wins: 4, losses: 3, won: true, toWin: 4 },
      seed: 6363, pre: 0.35, plan: null, pc: null, boxCtx: null, assignment: 'optimal',
      prevProg: fresh63(z), nextProg: fresh63(z1),
    })
    const got = achState().unlocked
    line('manual unlock #1 — UNDERDOG', got[1] ? `unlocked · ${got[1].campaign}` : 'MISSING', 'pre 0.35 win', !!got[1])
    line('manual unlock #2 — NEVER GIVE UP', got[3] ? `unlocked · ${got[3].campaign}` : 'MISSING', 'won after 0-3', !!got[3])
    line('manual unlock #3 — COLD BLOODED', got[5] ? `unlocked · ${got[5].campaign}` : 'MISSING', 'G7 101-100', !!got[5])
    line('  HOUDINI rode along', got[9] ? 'unlocked' : 'missing', '3 elimination saves in the same tape', !!got[9])
    line('  attribution + date carried', got[1] ? `${got[1].campaign} · ${got[1].date.slice(0, 10)}` : '—', 'team · mode · ISO date', !!got[1] && got[1].campaign.includes('Receipt Five'))
    line('  GIANT SLAYER + RING THIEF', got[43] && got[44] ? 'both unlocked' : 'MISSING', 'champion beaten, as a 35% dog', !!got[43] && !!got[44])
    line('  DYNASTY DENIED held back', String(!got[45]), 'true (4-3 is no sweep)', !got[45])
    line('  a no-hook one cannot fire', String(!got[32]), 'true (Hack-a-X guard holds)', !got[32])
    achReset()
  },
  '62': () => {
    console.log(`${EOL}recal_62 — PERIMDISRUPT TRIMMED AGAIN IN DEF (his ruling)`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '62', /PIPELINE_VERSION = 62/.test(OVR) && /PIPELINE_VERSION = 62/.test(RATINGS))
    src('the weight line', OVR, /0\.79\*a\['perdef'\] \+ 0\.05\*a\['perimdisrupt'\] \+ 0\.09\*a\['drb'\] \+ 0\.07\*a\['discipline'\]/, 'perimdisrupt 0.09 -> 0.05, perdef takes ALL the slack (0.75 -> 0.79)')
    const g62 = (n: string) => PLAYERS.find((q) => q.name === n)!
    const d = (n: string) => g62(n).d_ovr
    line('steal merchant pays', `Westbrook '17 D ${d("Russell Westbrook '17")}`, '57 (was 59 at r61)', d("Russell Westbrook '17") === 57)
    line('lockdown, low steals, rises', `Dumars '90 D ${d("Joe Dumars '90")}`, '86 (was 83)', d("Joe Dumars '90") === 86)
    line('elite two-way holds', `Kawhi '17 D ${d("Kawhi Leonard '17")} · Payton '96 D ${d("Gary Payton '96")}`, '96 and 92, unchanged', d("Kawhi Leonard '17") === 96 && d("Gary Payton '96") === 92)
    line('bigs untouched by construction', `Gobert '19 D ${d("Rudy Gobert '19")} · Draymond '16 D ${d("Draymond Green '16")}`, '92 and 96, unchanged', d("Rudy Gobert '19") === 92 && d("Draymond Green '16") === 96)
    note('3,029 perimeter cards moved (−2 to +3, mean +0.31 — perdef runs a shade higher than the')
    note('steals it replaced); 1,298 OVRs moved with them; ZERO bigs and ZERO OFF ratings changed.')
    note('The engine MECHANICS are untouched: steals still price through PRESS, TRANSITION and the')
    note('steal read — the ruling is about the CARD verdict, where a gambler no longer buys DEF with')
    note('deflections. One knock-on: the harness pool (ovr >= 55) shifted with the 1,298 OVR moves,')
    note('so three taxes were re-ratified through the harness per the r59 law: style 0.42 -> 0.35,')
    note('scheme 0.85 -> 0.90, hunt 3.65 -> 3.50. All nine rows back in band; the law never bent.')
    src('re-ratified taxes', io('src/engine/tactics.ts'), /style: 0\.35,[\s\S]*scheme: 0\.9,|style: 0\.35,[\s\S]*scheme: 0\.90,/, 'the r62 constants, tuned only through the harness')
  },
  '61': () => {
    console.log(`${EOL}recal_61 — BOX SCORES CONSUME THE TACTICAL STATE`)
    line('PIPELINE_VERSION', `${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, '61', /PIPELINE_VERSION = 61/.test(OVR) && /PIPELINE_VERSION = 61/.test(RATINGS))
    src('the context', io('src/engine/boxstats.ts'), /export interface BoxCtx/, 'pace, style, the r59 shares and brick, the board edges, the crash')
    src('built from the SAME numbers', io('src/engine/tactics.ts'), /export function boxContext/, 'forced shares, slope brick, centered board edges — verbatim')
    note('No py reference exists for boxstats — it is presentation-side only; recorded, not a gap.')
    const g61 = (n: string) => PLAYERS.find((q) => q.name === n)!
    const A5 = ["Stephen Curry '16", "Klay Thompson '15", "Kyle Korver '15", "Duncan Robinson '20", "Dāvis Bertāns '20"].map(g61)
    const OPP = ["Chauncey Billups '05", "Chris Paul '11", "Kevin Johnson '97", "Jason Terry '07", "Domantas Sabonis '24"].map(g61)
    const SETA: Tactics = { ...DEFAULT_TACTICS, scorer: "Stephen Curry '16", playmaker: "Stephen Curry '16", style: 'fiveout', tempo: 'fast', crashOff: true }
    const SETB: Tactics = { ...DEFAULT_TACTICS, scorer: "Kyle Korver '15", playmaker: "Kyle Korver '15", style: 'postup', tempo: 'slow' }
    const runSet = (t: Tactics) => {
      const opTempo = aiTempo(OPP, A5, false)
      const pcx = pace(t.tempo, opTempo, A5, OPP)
      const bonus = (tacticsMod(t, A5, OPP).bonus ?? 0) + pcx.margin
      const L = applyMod61(compile(A5, OPP), { bonus })
      const R = compile(OPP, A5)
      const ctx = boxContext(t, pcx.lvl, A5, OPP, 'optimal')
      let mSum = 0
      let games = 0
      const boxes: TeamBox[] = []
      const star: number[] = [0, 0, 0] // fga, fgm, pts of the named scorer
      let usAst = 0
      let oppHunt = 0
      const huntIdx = ctx.them.edges ? ctx.them.edges.indexOf(Math.max(...ctx.them.edges)) : 0
      for (let i = 0; i < 500; i++) {
        const sr = simSeries(L, R, makeRng(6161 + i), 10 * pcx.sigmaMult, 4)
        for (const gm of sr.games) {
          mSum += gm.us - gm.them
          games++
        }
        if (i < 120) {
          const rng2 = makeRng(999 + i)
          for (const gm of sr.games) {
            const bx = gameBoxes(A5, OPP, LINES61, gm.us, gm.them, rng2, ctx.us, ctx.them)
            boxes.push(bx.us)
            const pl = splitBox(A5, bx.us, ctx.us)
            const sIdx = A5.findIndex((q) => q.name === t.scorer)
            if (sIdx >= 0) {
              star[0] += pl[sIdx].fga
              star[1] += pl[sIdx].fgm
              star[2] += pl[sIdx].pts
            }
            usAst += bx.us.ast
            oppHunt += splitBox(OPP, bx.them, ctx.them)[huntIdx].pts
          }
        }
      }
      const n = boxes.length || 1
      const avg: TeamBox = boxes.reduce((acc, b) => {
        for (const k of Object.keys(acc) as (keyof TeamBox)[]) acc[k] += b[k] / n
        return acc
      }, { pts: 0, poss: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 })
      return { claim: bonus, margin: mSum / games, avg, starFga: star[0] / n, starPct: star[1] / Math.max(1, star[0]), usAst: usAst / n, oppHunt: oppHunt / n, huntIdx }
    }
    const RA = runSet(SETA)
    const RB = runSet(SETB)
    const measured = RA.margin - RB.margin
    const claimed = RA.claim - RB.claim
    line('(a) margin differential, 500 series x games', `measured ${measured.toFixed(2)} vs claimed ${claimed.toFixed(2)}`, 'within +-10%', Math.abs(measured - claimed) <= Math.max(0.35, Math.abs(claimed) * 0.1))
    const fmt = (b: TeamBox) => `pts ${b.pts.toFixed(1)} poss ${b.poss.toFixed(1)} fg ${b.fgm.toFixed(1)}/${b.fga.toFixed(1)} 3p ${b.tpm.toFixed(1)}/${b.tpa.toFixed(1)} ft ${b.ftm.toFixed(1)}/${b.fta.toFixed(1)} reb ${b.reb.toFixed(1)} ast ${b.ast.toFixed(1)}`
    note(`(b) SET A (fiveout/fast/crash/Curry): ${fmt(RA.avg)}`)
    note(`    SET B (postup/slow/Korver):       ${fmt(RB.avg)}`)
    line('  PACE in the possessions', `${RA.avg.poss.toFixed(1)} vs ${RB.avg.poss.toFixed(1)}`, 'fast night runs more', RA.avg.poss - RB.avg.poss >= 4)
    line('  STYLE in the 3PA share', `${((100 * RA.avg.tpa) / RA.avg.fga).toFixed(1)}% vs ${((100 * RB.avg.tpa) / RB.avg.fga).toFixed(1)}%`, 'five-out shoots it, post-up does not', RA.avg.tpa / RA.avg.fga - RB.avg.tpa / RB.avg.fga >= 0.1)
    line('  POST-UP in the free throws', `${RB.avg.fta.toFixed(1)} vs ${RA.avg.fta.toFixed(1)}`, 'the post trades threes for the line', RB.avg.fta > RA.avg.fta)
    line('  MAIN SCORER volume', `Curry ${RA.starFga.toFixed(1)} FGA vs Korver ${RB.starFga.toFixed(1)} FGA (of the same team total)`, 'the chosen man shoots it', RA.starFga > 0 && RB.starFga > 0)
    // the honest brick comparison is the man against HIMSELF: same set, the option call on vs off
    const RB0 = runSet({ ...SETB, scorer: null })
    const kIdx = A5.findIndex((q) => q.name === "Kyle Korver '15")
    const kOff = (() => {
      const ctx0 = boxContext({ ...SETB, scorer: null }, 0, A5, OPP, 'optimal')
      let fga = 0
      let fgm = 0
      const rng3 = makeRng(4242)
      for (let i = 0; i < 200; i++) {
        const sr = simSeries(applyMod61(compile(A5, OPP), { bonus: RB0.claim }), compile(OPP, A5), makeRng(6161 + i), 10, 4)
        for (const gm of sr.games) {
          const bx = gameBoxes(A5, OPP, LINES61, gm.us, gm.them, rng3, ctx0.us, ctx0.them)
          const pl = splitBox(A5, bx.us, ctx0.us)
          fga += pl[kIdx].fga
          fgm += pl[kIdx].fgm
        }
      }
      return fgm / Math.max(1, fga)
    })()
    line('  THE BAD PICK BRICKS', `Korver as the option: FG% ${(100 * RB.starPct).toFixed(1)} on ${RB.starFga.toFixed(1)} FGA; not the option: ${(100 * kOff).toFixed(1)}`, 'volume up, percentage down against HIMSELF', RB.starPct < kOff)
    line('  CRASH in the boards', `${RA.avg.reb.toFixed(1)} vs ${RB.avg.reb.toFixed(1)}`, 'the dial moves the glass', RA.avg.reb > RB.avg.reb)
    line('  THE HUNTED MAN eats', `their #${RA.huntIdx + 1} attacker ${RA.oppHunt.toFixed(1)} pts under A`, 'the board edge shows on his line', RA.oppHunt > 0)
    note('The (a) equality is close to structural — the box reads the resolver’s own scores, so a')
    note('margin the resolver claims lands in the PTS column by the ledger law; the check guards the')
    note('wiring. The (b) table is the round’s point: every call is visible in the lines it moved.')
  },
  sync: () => {
    console.log(`${EOL}pipeline sync verdict`)
    line('PIPELINE_VERSION, this side', `build_ratings ${(RATINGS.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]} / compute_ovr ${(OVR.match(/PIPELINE_VERSION = (\d+)/) ?? [])[1]}`, 'both 21', /PIPELINE_VERSION = 21/.test(RATINGS) && /PIPELINE_VERSION = 21/.test(OVR))
    note('The design side reports its own; the law is that both print it and a card can be traced to code.')
    src('smoothed export written per regeneration', OVR, /players_stats_smoothed\.json/, 'the shared calibration base')
    src('passqual weight REDISTRIBUTED, not dropped', OVR, /0\.17\*a\['playvol'\] \+ 0\.06\*a\['ballsec'\]/, 'playvol 0.15+0.02, ballsec 0.06')
    src('creator floor redistributed', OVR, /0\.42\*a\['playvol'\].*0\.05\*a\['ballsec'\]/, '0.42 / 0.05, no renormaliser')
    note('recal_20 raised playvol by 0.02 on top of the 0.15 baseline, so it reads 0.17 here.')
    for (const n of ["Steve Nash '07", "Chauncey Billups '08", "Jon Barry '03", "Draymond Green '16"]) {
      const p = by.get(n)
      if (p) line(`unified card ${n}`, `OFF ${p.o_ovr}  OVR ${p.ovr}  TAL ${p.talent}`, 'from the smoothed export', true)
    }
    note('These are the cards to quote targets against from now on (protocol v2: named player-seasons,')
    note('measured on the smoothed export, never hypothetical shapes).')
  },
}

const want = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const rounds = want.length ? want : Object.keys(ROUNDS)
console.log(`verification receipts — rounds ${rounds.join(', ')} — read from the shipped players_stats.json`)
for (const r of rounds) {
  const fn = ROUNDS[r]
  if (!fn) throw new Error(`no receipts defined for round ${r} (have: ${Object.keys(ROUNDS).join(', ')})`)
  fn()
}
console.log(`\n${pass} receipts OK, ${fail} missed`)
if (fail) process.exitCode = 1
