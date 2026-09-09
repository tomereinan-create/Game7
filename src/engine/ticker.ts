import { gameBoxes, splitBox, type BoxCtx, type PlayerBox } from './boxstats'
import { boxScore } from './resolver'
import type { Rng } from './rng'
import { surname } from './names'
import type { Player, StatLine } from './types'

export interface Tick {
  q: number
  clock: string
  text: string
  us: number
  them: number
  /** True once we are inside a tight fourth quarter — the UI slows down here. */
  slow: boolean
  /** Whose possession this was. */
  side: 'us' | 'them'
  /** Points this event put on the board — 0 for a miss, a turnover, a block, a steal. */
  pts: number
}

const CLOSE_MARGIN = 6

const TWO = ['drives', 'pulls up', 'turnaround', 'putback', 'floater', 'dunks it', 'cuts baseline', 'fadeaway']
const THREE = ['from deep', 'corner three', 'steps back, three', 'pulls the trigger, three', 'transition three']
const MISS = ['rims it out', 'off the front iron', 'short', 'off the back rim', 'rattles out']
const MISS3 = ['from deep, off', 'corner three, no', 'steps back, misses']
const LOSE = ['loses the handle', 'travels', 'throws it away', 'steps on the line', 'charges in']

// One rule for a short name, shared with the jersey and the tactics chips — see names.ts. This
// used to keep the season, so the tape read "Maxey '26 boards it".

function clockFor(fraction: number): string {
  const secs = Math.max(0, Math.round(720 * (1 - Math.min(1, Math.max(0, fraction)))))
  return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`
}

/** Draw one index from `weights`, proportional. */
function draw(weights: number[], rng: Rng): number {
  const t = weights.reduce((a, b) => a + b, 0)
  if (t <= 0) return 0
  let r = rng.next() * t
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

interface Ev {
  side: 'us' | 'them'
  pts: number
  text: string
}

/**
 * Every event ONE side's box line contains, as text. The tape is built from the box and from
 * nothing else, which is the whole of the 2026-09-09 fix:
 *
 *   B2  the old tape held made baskets and NOTHING ELSE — no miss, no turnover, no stop. A Game 7
 *       was a metronome in which nobody ever missed. Misses (fga - fgm), turnovers, blocks and
 *       steals now come off the same line the box score prints.
 *   B3  who scored was drawn from `(volume - 40) * 0.4 + (fit - 45) * 0.8`, which reads neither
 *       usage nor the box, so the tape and the box disagreed about the same game — Bagley III took
 *       four baskets of one quarter and finished on 23.3 a night against a real 10.5. The scorer of
 *       every basket is now the man the box says scored it, so the tape cannot invent a night the
 *       box does not show.
 */
function eventsFor(side: 'us' | 'them', mine: PlayerBox[], theirs: PlayerBox[], rng: Rng): Ev[] {
  const evs: Ev[] = []
  const name = (l: PlayerBox) => surname(l.name)
  // whoever on the other side still has a block or a steal left to spend
  const blk = theirs.map((l) => l.blk)
  const stl = theirs.map((l) => l.stl)
  // rebounders on both sides, by their own board count
  const rebMine = mine.map((l) => l.reb)
  const rebTheirs = theirs.map((l) => l.reb)

  for (const l of mine) {
    for (let k = 0; k < l.tpm; k++) evs.push({ side, pts: 3, text: `${name(l)} ${rng.pick(THREE)}` })
    for (let k = 0; k < l.fgm - l.tpm; k++) evs.push({ side, pts: 2, text: `${name(l)} ${rng.pick(TWO)}` })
    // free throws go up in trips, the way they are shot
    let ft = l.ftm
    while (ft > 0) {
      const n = ft >= 2 && rng.next() < 0.7 ? 2 : 1
      evs.push({ side, pts: n, text: n === 2 ? `${name(l)} sinks both at the line` : `${name(l)} splits the pair` })
      ft -= n
    }
    const missed = Math.max(0, l.fga - l.fgm)
    const missed3 = Math.max(0, Math.min(missed, l.tpa - l.tpm))
    for (let k = 0; k < missed; k++) {
      const isThree = k < missed3
      let text: string
      if (!isThree && blk.some((b) => b > 0) && rng.next() < 0.28) {
        const j = draw(blk, rng)
        blk[j]--
        text = `${name(theirs[j])} BLOCKS ${name(l)}`
      } else {
        text = `${name(l)} ${isThree ? rng.pick(MISS3) : rng.pick(MISS)}`
      }
      // a miss is a board for somebody — theirs about seven times in ten
      const off = rng.next() < 0.28
      const pool = off ? rebMine : rebTheirs
      const from = off ? mine : theirs
      if (pool.some((r) => r > 0)) {
        const j = draw(pool, rng)
        pool[j]--
        text += off ? ` · ${name(from[j])} keeps it alive` : ` · ${name(from[j])} boards it`
      }
      evs.push({ side, pts: 0, text })
    }
    for (let k = 0; k < l.tov; k++) {
      if (stl.some((v) => v > 0) && rng.next() < 0.6) {
        const j = draw(stl, rng)
        stl[j]--
        evs.push({ side, pts: 0, text: `${name(theirs[j])} steals it from ${name(l)}` })
      } else {
        evs.push({ side, pts: 0, text: `${name(l)} ${rng.pick(LOSE)}` })
      }
    }
  }
  // shuffle within the side so one man's makes do not arrive in a block
  for (let i = evs.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const t = evs[i]
    evs[i] = evs[j]
    evs[j] = t
  }
  return evs
}

/**
 * Game 7 presentation. The resolver decided the margin; this plays the night that produced it.
 *
 * The score is `boxScore(margin)` — the same call the resolver makes, so the Series screen's
 * `scoresOf` override still lines the tape up with the record — and the box for that exact score
 * supplies every event on the tape.
 */
export function buildTicker(
  margin: number,
  us: Player[],
  them: Player[],
  rng: Rng,
  lines: Record<string, StatLine | null>,
  ctx?: { us: BoxCtx; them: BoxCtx },
): { ticks: Tick[]; us: number; them: number } {
  const s = boxScore(margin, rng)
  const won = margin > 0
  const finalUs = won ? s.win : s.lose
  const finalThem = won ? s.lose : s.win

  const g = gameBoxes(us, them, lines, finalUs, finalThem, rng, ctx?.us, ctx?.them)
  const usL = splitBox(us, g.us, ctx?.us, rng)
  const themL = splitBox(them, g.them, ctx?.them, rng)

  const ourEv = eventsFor('us', usL, themL, rng)
  const theirEv = eventsFor('them', themL, usL, rng)

  // Interleave by events remaining, so both sides empty together and neither runs the whole game.
  let a = 0
  let b = 0
  let ai = 0
  let bi = 0
  const ticks: Tick[] = []
  while (ai < ourEv.length || bi < theirEv.length) {
    const ra = ourEv.length - ai
    const rb = theirEv.length - bi
    const ours = bi >= theirEv.length ? true : ai >= ourEv.length ? false : rng.next() < ra / (ra + rb)
    const e = ours ? ourEv[ai++] : theirEv[bi++]
    if (ours) a += e.pts
    else b += e.pts
    ticks.push({ q: 1, clock: '12:00', text: e.text, us: a, them: b, slow: false, side: e.side, pts: e.pts })
  }

  /**
   * B1: the clock. It used to be `idx / (totalEvents - 1)`, a straight line, so every gap was the
   * same 32 seconds and every quarter ran the identical schedule — Q2 and Q4 printed the same
   * stamps down the list. Possessions are drawn Exp(1) now and normalised across the whole game,
   * so gaps vary and no two quarters look alike. Monotone by construction: the cumulative sum only
   * rises, so the clock only falls inside a quarter and `q` only ever climbs.
   */
  const gaps = ticks.map(() => -Math.log(1 - rng.next() * 0.999999) + 0.15)
  const total = gaps.reduce((x, y) => x + y, 0) || 1
  let acc = 0
  ticks.forEach((t, i) => {
    acc += gaps[i]
    const frac = Math.min(0.99999, acc / total)
    t.q = Math.min(4, Math.floor(frac * 4) + 1)
    t.clock = clockFor(frac * 4 - (t.q - 1))
  })

  // Close game entering Q4? Then the last quarter crawls.
  const q4Start = ticks.findIndex((t) => t.q === 4)
  if (q4Start > 0 && Math.abs(ticks[q4Start - 1].us - ticks[q4Start - 1].them) <= CLOSE_MARGIN) {
    for (let i = q4Start; i < ticks.length; i++) ticks[i].slow = true
  }

  return { ticks, us: finalUs, them: finalThem }
}
