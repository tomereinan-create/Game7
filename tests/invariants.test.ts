import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLAYERS } from '../src/engine/pool'
import { ATTR_KEYS } from '../src/engine/types'

/**
 * PINNED INVARIANTS (audit rulings 5 and 8). Each of these was won once and can be
 * silently undone by an innocent-looking pipeline edit, so each is nailed down here:
 * a data pin (what the shipped ratings must show) and, where the rule lives in the
 * Python pipeline, a source pin (the mechanism must still be in the file). A source
 * pin fails loudly on rewording — that is the point: the rewrite has to come back
 * through this test and be re-ratified rather than pass unnoticed.
 */
const RATINGS = readFileSync('data/build_ratings.py', 'utf8')
const OVR = readFileSync('data/compute_ovr.py', 'utf8')
const by = new Map(PLAYERS.map((p) => [p.name, p]))
const seasonsOf = (who: string) => PLAYERS.filter((p) => p.name.startsWith(`${who} '`))

describe('pinned invariants', () => {
  it('ruling 5 — Wembanyama rim protection clears the ratified floor of 95', () => {
    const w = by.get("Victor Wembanyama '26")!
    expect(w.attrs.rimprot).toBeGreaterThanOrEqual(95)
    // The audit accepted 97 and loosened acceptance to >= 95. Anything under 95 means the
    // deterrent scale or the <6ft tracking blend regressed.
    console.log(`  Wemby '26 rimprot ${w.attrs.rimprot}`)
  })

  it('ruling 8 — the 150-attempt thin-sample discount still shrinks tracking evidence', () => {
    expect(RATINGS).toMatch(/MIN_ATT\s*=\s*150\.0/)
    // The discount must be applied both to the individual value and to the percentile pool,
    // otherwise a 12-attempt sample is ranked against fully-weighted ones.
    expect(RATINGS).toMatch(/return d \* min\(1\.0, att \/ MIN_ATT\) if att else None/)
    expect(RATINGS).toMatch(/vals = \[d \* min\(1\.0, a \/ MIN_ATT\) for d, a in TRACKING/)
  })

  it('ruling 8 — a lifetime guard is never classified as a big', () => {
    expect(OVR).toMatch(/never.*(PF|C)|lifetime[- ]guard/i)
    const guards = ['Gary Payton', 'Chris Paul', 'Michael Jordan', 'Dwyane Wade', 'Allen Iverson', 'Jrue Holiday', 'Marcus Smart', 'Russell Westbrook', 'Stephen Curry', 'Tony Allen']
    for (const g of guards) {
      const ss = seasonsOf(g)
      expect(ss.length, `${g} missing from the pool`).toBeGreaterThan(0)
      for (const s of ss) expect(s.big, `${s.name} flagged big`).toBe(false)
    }
    // and nobody in the pool gets there by the back door
    const wrong = PLAYERS.filter((p) => p.big && guards.some((g) => p.name.startsWith(`${g} '`)))
    expect(wrong.map((p) => p.name)).toEqual([])
  })

  it('passqual is gone from the model and cannot creep back', () => {
    // His ruling: removed entirely, weight DROPPED (survivors renormalised, nothing redistributed).
    expect(PLAYERS.some((p) => 'passqual' in (p.attrs as unknown as Record<string, unknown>))).toBe(false)
    expect(ATTR_KEYS).not.toContain('passqual')
    for (const [file, text] of [['build_ratings.py', RATINGS], ['compute_ovr.py', OVR]] as const)
      expect(text, `${file} still references passqual`).not.toMatch(/a\['passqual'\]|passqual=/)
    // creation reads volume and ball security only, renormalised over the surviving 0.65
    expect(readFileSync('src/engine/offense.ts', 'utf8')).toMatch(/0\.45 \* a\.playvol \+ 0\.2 \* a\.ballsec\) \/ \(0\.65 \* 99\)/)
  })

  it('ruling 8 — 99 stays reachable for rim protection (the ceiling work holds)', () => {
    const top = Math.max(...PLAYERS.map((p) => p.attrs.rimprot))
    expect(top).toBe(99)
    // the three pieces that opened the ceiling: a top percentile of exactly 1.0, a class scale
    // that saturates at 1.0 rather than 0.99, and a <6ft blend that is not clamped below 1.0
    expect(RATINGS).toMatch(/def pctile_top/)
    expect(RATINGS).toMatch(/min\(1, 0\.55 ?\+ ?0\.47 ?\* ?pct\)|0\.55 \+ 0\.47/)
    expect(RATINGS).toMatch(/ID2 = min\(1\.0, 0\.65\*ID2 \+ 0\.35\*/)
    console.log(`  rim ceiling: top rimprot ${top}, ${PLAYERS.filter((p) => p.attrs.rimprot >= 97).length} seasons at 97+`)
  })
})
