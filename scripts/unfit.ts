/**
 * WHO THE TREE CANNOT NAME (his ruling: tell me, don't soften them).
 *
 * Every card above the Balanced cap that matched no rule at the tree's own thresholds. Nothing here
 * is a bug in the labeler — it is the tree's honest answer, and it is the work queue: each name is
 * either a rule that does not exist yet or a threshold set a few points too high.
 *
 * For each man it also prints the rule he came CLOSEST to and by how much, because a card that misses
 * TWO-WAY STAR by one point is a different problem from one that misses everything by twenty.
 *
 *     npm run unfit             the list
 *     npm run unfit -- --all    every card, not just the top 40
 */
import { archetype, ctxFor, PLAYERS, RULES, ruleText, UNCLASSIFIED } from '../src/engine/pool'
import type { Player } from '../src/engine/types'

const all = process.argv.includes('--all')
const unfit = PLAYERS.filter((p) => archetype(p) === UNCLASSIFIED).sort((a, b) => b.ovr - a.ovr)

/**
 * The smallest relaxation at which some rule would have named him. Walked in the tree's own order, so
 * the answer is the tag he would actually have received, not merely one he could satisfy.
 */
function nearest(p: Player): { tag: string; miss: number } | null {
  for (let relax = 1; relax <= 25; relax++) {
    for (const r of RULES) {
      try {
        if (tagAt(p, r.tag, relax)) return { tag: r.tag, miss: relax }
      } catch {
        /* a rule that throws on this sheet simply does not name him */
      }
    }
  }
  return null
}

/** Does the named rule match this sheet at this relaxation? Read through the labeler's own context. */
function tagAt(p: Player, tag: string, relax: number): boolean {
  const rule = RULES.find((r) => r.tag === tag)
  return rule ? rule.test(ctxFor(p, relax)) : false
}

console.log(`\n${unfit.length} cards the tree cannot name at its own thresholds (OVR 80+).`)
console.log('Not softened, not relabelled — listed. Each one is a missing rule or a threshold too high.\n')

const near = new Map<string, { miss: number; who: string[] }>()
for (const p of all ? unfit : unfit.slice(0, 40)) {
  const a = p.attrs
  const n = nearest(p)
  console.log(
    `  ${p.name.padEnd(26)} OVR ${String(p.ovr).padStart(2)}  O ${String(p.o_ovr).padStart(2)} D ${String(p.d_ovr).padStart(2)}` +
      `   ${n ? `closest: ${n.tag} (misses by ${n.miss})` : 'matches nothing within 25 points'}`,
  )
  console.log(
    `  ${' '.repeat(26)} 3pt ${a['3pt']} rim ${a.rim} mid ${a.mid} vol ${a.volume} eff ${a.efficiency}` +
      ` playvol ${a.playvol} perdef ${a.perdef} rimprot ${a.rimprot} orb ${a.orb} drb ${a.drb} h ${a.height}`,
  )
  if (n) {
    const e = near.get(n.tag) ?? { miss: 99, who: [] }
    near.set(n.tag, { miss: Math.min(e.miss, n.miss), who: [...e.who, p.name] })
  }
}
if (!all && unfit.length > 40) console.log(`\n  ... ${unfit.length - 40} more. Run with --all to print them.`)

console.log('\nWHERE THE TREE IS SHORT — the rule each man came closest to:')
for (const [tag, e] of [...near].sort((a, b) => b[1].who.length - a[1].who.length)) {
  console.log(`  ${tag.padEnd(24)} ${String(e.who.length).padStart(3)} card(s), the closest missing by ${e.miss}`)
  console.log(`      ${ruleText(tag)}`)
  console.log(`      e.g. ${e.who.slice(0, 3).join(', ')}`)
}
