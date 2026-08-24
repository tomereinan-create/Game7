/**
 * MISLABEL AUDIT (recal_25 #4). Every card must actually satisfy the numeric conditions of the tag it
 * displays. This walks all 10,000 and re-evaluates each one's own rule against his sheet.
 *
 * The one legitimate exception is the OVR-79 rescue: a good player the strict tree could not name is
 * re-read with every threshold relaxed by 10 (recal_15 tree law), so his tag is satisfied AT THAT
 * RELAXATION, not at zero. The audit therefore checks each card at the relaxation that actually
 * produced his tag — and reports how many cards lean on the rescue, since a tag that is only ever
 * reached through relaxation is a threshold worth revisiting.
 *
 *     npm run audit-tags
 */
import { archetype, BALANCED_CAP, ctxFor, PLAYERS, RELAX, RULES, ruleText, UNCLASSIFIED } from '../src/engine/pool'

const BY_TAG = new Map(RULES.map((r) => [r.tag, r]))

let violations = 0
let unfit = 0
for (const p of PLAYERS) {
  const tag = archetype(p)
  if (tag === UNCLASSIFIED) {
    // not a mislabel: the tree declined to name him, and says so. Counted, and listed by `npm run unfit`.
    unfit++
    continue
  }
  if (tag === 'Balanced') {
    // the fallback's only condition is that nothing else matched, plus the OVR cap
    if (p.ovr > BALANCED_CAP) {
      violations++
      console.log(`  VIOLATION  ${p.name.padEnd(26)} Balanced   OVR ${p.ovr} > the ${BALANCED_CAP} cap`)
    }
    continue
  }
  const rule = BY_TAG.get(tag)
  if (!rule) {
    violations++
    console.log(`  VIOLATION  ${p.name.padEnd(26)} ${tag} — no rule of that name exists`)
    continue
  }
  // No exceptions left to account for: every displayed tag was matched at the tree's own thresholds.
  if (!rule.test(ctxFor(p, RELAX))) {
    violations++
    const a = p.attrs
    console.log(`  VIOLATION  ${p.name.padEnd(26)} ${tag}`)
    console.log(`             rule: ${ruleText(tag)}`)
    console.log(
      `             sheet: 3pt ${a['3pt']} rim ${a.rim} mid ${a.mid} playvol ${a.playvol} volume ${a.volume} perdef ${a.perdef} rimprot ${a.rimprot} h ${a.height} OVR ${p.ovr} O ${p.o_ovr} D ${p.d_ovr}`,
    )
  }
}

console.log(`\n${PLAYERS.length.toLocaleString()} cards audited — ${violations} violations`)
console.log(`${unfit.toLocaleString()} cards above OVR ${BALANCED_CAP} are UNCLASSIFIED — the tree has no rule for them.`)
console.log('They are reported, never softened into a fit. `npm run unfit` prints them with their sheets.')
if (violations) process.exitCode = 1
