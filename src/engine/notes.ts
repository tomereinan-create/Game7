import type { MarginTerms } from './resolver'

/**
 * The one-line note under a game score. It is NOT flavor: it names whichever
 * of the two margin terms actually moved the game the most, from our side.
 */
export function noteFor(t: MarginTerms): string {
  // Signed from OUR point of view: positive means it helped us. Every value is
  // in margin points, so the largest really is the one that decided the game.
  const candidates: { key: string; value: number }[] = [
    { key: 'talent', value: t.talent },
    { key: 'offense', value: t.offense },
    { key: 'defense', value: t.defense },
  ]

  let best = candidates[0]
  for (const c of candidates) if (Math.abs(c.value) > Math.abs(best.value)) best = c

  // The deciding term and its size, in margin points. No flavor.
  const v = best.value
  return `${best.key} ${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`
}

/** Used by the series line under the box scores. */
export function seriesNote(won: boolean, wins: number, losses: number): string {
  const n = wins + losses
  return won ? `Series won in ${n}` : `Series lost in ${n}`
}
