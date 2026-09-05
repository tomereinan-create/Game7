/** recal_143 — the FRONTIER: max subject dial under progressively fewer bounds. */
import { evaluate } from './sweep143'
import { KNOBS as K } from '../src/engine/offense'

const base = evaluate({ SHARE: K.CREATE_SHARE, TOV: K.TOV_SIZE, AMP: K.AMP_MAX })
const floor = base.fit - 0.003

interface C {
  s: number; t: number; a: number; pho: number; raw: number; fit: number
  chi: number; chir: number; lal: number; lalr: number; bosr: number; above: number; n99: number
}
const all: C[] = []
for (const s of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
  for (const t of [0.45, 0.6, 0.7, 0.8, 1.0, 1.3, 1.6, 2.0]) {
    for (const a of [0.18, 0.26, 0.34, 0.42]) {
      const E = evaluate({ SHARE: s, TOV: t, AMP: a })
      const v = E.adjOf(2005, 'PHO')
      const raw = v <= E.G.MID ? 1 + (49 * (v - E.G.MIN)) / (E.G.MID - E.G.MIN) : 50 + (49 * (v - E.G.MID)) / (E.G.TOP - E.G.MID)
      all.push({
        s, t, a, pho: E.dial(2005, 'PHO'), raw, fit: E.fit,
        chi: E.dial(1996, 'CHI'), chir: E.rank(1996, 'CHI')[0], lal: E.dial(2000, 'LAL'), lalr: E.rank(2000, 'LAL')[0],
        bosr: E.rank(2024, 'BOS')[0], above: E.above, n99: E.n99,
      })
    }
  }
}
const show = (label: string, f: (c: C) => boolean) => {
  const g = all.filter(f).sort((x, y) => y.raw - x.raw)
  console.log(`\n${label}: ${g.length} cells, best 5:`)
  for (const c of g.slice(0, 5)) console.log(`  s${c.s} t${c.t} a${c.a}  PHO ${c.pho} (raw ${c.raw.toFixed(1)}) fit ${c.fit.toFixed(4)}  CHI ${c.chi}(r${c.chir}) LAL ${c.lal}(r${c.lalr}) BOSr ${c.bosr} above ${c.above} n99 ${c.n99}`)
}
const fitOk = (c: C) => c.fit >= floor
const dialPins = (c: C) => Math.abs(c.chi - 68) <= 3 && Math.abs(c.lal - 64) <= 4 && c.lalr <= 5
console.log(`baseline fit ${base.fit.toFixed(4)} floor ${floor.toFixed(4)} PHO ${base.dial(2005, 'PHO')} raw`)
show('ALL PINS (dial pins + CHI rank<=6 + BOS rank<=10 + above<=1 + fit)', (c) => fitOk(c) && dialPins(c) && c.chir <= 6 && c.bosr <= 10 && c.above <= 1)
show('CHI rank re-cut to <=9', (c) => fitOk(c) && dialPins(c) && c.chir <= 9 && c.bosr <= 10 && c.above <= 1)
show('and BOS24 rank dropped entirely', (c) => fitOk(c) && dialPins(c) && c.above <= 1)
show('and the summit order dropped (any number above GSW)', (c) => fitOk(c) && dialPins(c))
show('and the fit floor dropped', (c) => dialPins(c))
show('and the Bulls 96 OFF dial dropped (only LAL + fit)', (c) => fitOk(c) && Math.abs(c.lal - 64) <= 4 && c.lalr <= 5)
show('NO BOUNDS AT ALL', () => true)
