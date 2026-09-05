/** recal_141 — re-ratification sweep for the taxes the round's pool shift broke (hunt, crashDef). */
import { TAX } from '../../src/engine/tactics'
import { runHarness } from '../../src/engine/harness'
const which = process.argv[2] as keyof typeof TAX
const vals = process.argv.slice(3).map(Number)
const row = which === 'hunt' ? 'hunt' : which === 'crashDef' ? 'crash def glass' : which === 'crashOff' ? 'crash off glass' : which
const orig = TAX[which]
for (const v of vals) {
  ;(TAX as Record<string, number>)[which] = v
  const r = runHarness(200).find((x) => x.tactic === row)!
  console.log(`${which} ${v.toFixed(3)}  blind ${r.random.toFixed(3)}  oracle ${r.oracle.toFixed(3)}  ${r.random >= -1.5 && r.random <= -0.3 && r.oracle >= 0.5 ? 'PASS' : 'FAIL'}`)
}
;(TAX as Record<string, number>)[which] = orig
