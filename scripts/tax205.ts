/**
 * recal_205 tax sweep — the deviation-tax law (recal_59) re-ratified on the pool this round moved.
 * Mutates TAX in place and re-runs the harness row by row, exactly as every earlier break was swept.
 *
 *   npx vite-node scripts/tax205.ts hunt 3.65 3.70 3.80
 *   npx vite-node scripts/tax205.ts crashDef 0.60 0.50 0.40
 */
import { runHarness } from '../src/engine/harness'
import { TAX } from '../src/engine/tactics'

const ROW: Record<string, string> = {
  scorer: 'main scorer',
  playmaker: 'main playmaker',
  tempo: 'tempo',
  style: 'playstyle',
  scheme: 'scheme',
  hunt: 'hunt',
  crashOff: 'crash off glass',
  crashDef: 'crash def glass',
}
const key = process.argv[2] as keyof typeof TAX
const vals = process.argv.slice(3).map(Number)
const row = ROW[key]
const keep = TAX[key]
for (const v of vals) {
  TAX[key] = v
  const r = runHarness(200).find((x) => x.tactic === row)!
  console.log(
    `${key} ${v.toFixed(3)}  blind ${r.random.toFixed(4)}  oracle ${r.oracle.toFixed(4)}  ${r.pass ? 'PASS' : 'FAIL'}`,
  )
}
TAX[key] = keep
