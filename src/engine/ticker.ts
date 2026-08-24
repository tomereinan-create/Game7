import { boxScore } from './resolver'
import type { Rng } from './rng'
import type { Player } from './types'

export interface Tick {
  q: number
  clock: string
  text: string
  us: number
  them: number
  /** True once we are inside a tight fourth quarter — the UI slows down here. */
  slow: boolean
}

const CLOSE_MARGIN = 6

const TWO = ['drives', 'pulls up', 'turnaround', 'putback', 'floater', 'dunks it', 'cuts baseline', 'fadeaway']
const THREE = ['from deep', 'corner three', 'steps back, three', 'pulls the trigger, three', 'transition three']
const ONE = ['at the line', 'splits the pair', 'from the stripe']

/** Chunks of points that add up exactly to `total`. */
function scoringRuns(total: number, threeBias: number, rng: Rng): number[] {
  const runs: number[] = []
  let left = total
  while (left > 0) {
    if (left <= 3) {
      runs.push(left)
      break
    }
    const r = rng.next()
    if (r < threeBias) runs.push(3)
    else if (r < threeBias + 0.12) runs.push(1)
    else runs.push(2)
    left -= runs[runs.length - 1]
  }
  return runs
}

function shooter(players: Player[], pts: number, rng: Rng): string {
  // Weight by usage and by the axis that fits the shot.
  const w = players.map((p) => {
    const fit = pts === 3 ? p.out : p.in
    return Math.max(1, (p.attrs.volume - 40) * 0.4 + (fit - 45) * 0.8)
  })
  const total = w.reduce((a, b) => a + b, 0)
  let r = rng.next() * total
  for (let i = 0; i < players.length; i++) {
    r -= w[i]
    if (r <= 0) return players[i].name
  }
  return players[players.length - 1].name
}

const lastName = (n: string) => n.split(' ').slice(1).join(' ') || n

function clockFor(fraction: number): string {
  const secs = Math.max(0, Math.round(720 * (1 - fraction)))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Game 7 presentation. The resolver already decided the margin; this fabricates
 * a plausible point-by-point path that lands exactly on the final score.
 */
export function buildTicker(margin: number, us: Player[], them: Player[], rng: Rng): { ticks: Tick[]; us: number; them: number } {
  const s = boxScore(margin, rng)
  const won = margin > 0
  const finalUs = won ? s.win : s.lose
  const finalThem = won ? s.lose : s.win

  const bias = (ps: Player[]) => {
    const l = ps.reduce((a, p) => a + p.out, 0) / ps.length
    const i = ps.reduce((a, p) => a + p.in, 0) / ps.length
    return Math.min(0.5, Math.max(0.14, (l / (l + i)) * 0.72))
  }

  const ourRuns = scoringRuns(finalUs, bias(us), rng)
  const theirRuns = scoringRuns(finalThem, bias(them), rng)

  // Interleave by remaining points: a discrete bridge that must end on the score.
  let a = 0
  let b = 0
  let ai = 0
  let bi = 0
  const ticks: Tick[] = []
  const totalEvents = ourRuns.length + theirRuns.length

  while (ai < ourRuns.length || bi < theirRuns.length) {
    const ra = finalUs - a
    const rb = finalThem - b
    const ours = bi >= theirRuns.length ? true : ai >= ourRuns.length ? false : rng.next() < ra / (ra + rb || 1)

    const pts = ours ? ourRuns[ai++] : theirRuns[bi++]
    if (ours) a += pts
    else b += pts

    const verb = pts === 3 ? rng.pick(THREE) : pts === 1 ? rng.pick(ONE) : rng.pick(TWO)
    const who = lastName(shooter(ours ? us : them, pts, rng))

    const idx = ticks.length
    const prog = idx / Math.max(1, totalEvents - 1)
    const q = Math.min(4, Math.floor(prog * 4) + 1)
    const inQ = prog * 4 - (q - 1)

    ticks.push({
      q,
      clock: clockFor(Math.min(1, inQ)),
      text: `${who} ${verb}`,
      us: a,
      them: b,
      slow: false,
    })
  }

  // Close game entering Q4? Then the last quarter crawls.
  const q4Start = ticks.findIndex((t) => t.q === 4)
  if (q4Start > 0 && Math.abs(ticks[q4Start - 1].us - ticks[q4Start - 1].them) <= CLOSE_MARGIN) {
    for (let i = q4Start; i < ticks.length; i++) ticks[i].slow = true
  }

  return { ticks, us: finalUs, them: finalThem }
}
