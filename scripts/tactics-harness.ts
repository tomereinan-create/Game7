import { harnessTable, runHarness } from '../src/engine/harness'
console.log(harnessTable(runHarness(200).map((r) => (r.tactic === 'assignment' ? runHarness(800).find((x) => x.tactic === 'assignment')! : r)) /* the assignment row's sign is read at 800 matchups — see tests/tactics.test.ts */))
