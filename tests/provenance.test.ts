/**
 * The card's Advanced panel fetches `provenance.json` from public/, but the
 * pipeline writes data/provenance.json. When the copy fell behind, the panel
 * kept quoting a season the formula had stopped reading — Ajay Mitchell '26 was
 * shown "+1.6% on 217 shots" from the old 15ft+ series while the rating had read
 * the derived 6ft+ series since recal_55, and nothing anywhere said so.
 *
 * A stale copy is invisible on the screen, so it has to be loud here.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pipeline = join(root, 'data', 'provenance.json')
const shipped = join(root, 'public', 'provenance.json')

describe('the provenance the card reads', () => {
  it('is byte-identical to the one the pipeline wrote', () => {
    const a = readFileSync(pipeline)
    const b = readFileSync(shipped)
    expect(
      b.equals(a),
      'public/provenance.json has drifted from data/provenance.json — copy it across (the regeneration step does this)',
    ).toBe(true)
  })

  it('has a row for every card the app ships', () => {
    const prov = JSON.parse(readFileSync(shipped, 'utf8')) as Record<string, unknown>
    const cards = JSON.parse(readFileSync(join(root, 'src', 'data', 'players_stats.json'), 'utf8')) as {
      name: string
    }[]
    const missing = cards.filter((c) => !prov[c.name]).map((c) => c.name)
    expect(missing.slice(0, 5)).toEqual([])
    expect(cards.length).toBeGreaterThan(0)
  })
})
