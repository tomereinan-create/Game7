/** recal_76 sanity: pull the real population behind a handful of tags — including the
 *  near-neighbour pairs — so the rewritten prose can be read against the men it describes. */
import { archetype, PLAYERS } from '../src/engine/pool'

const PICK = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['Two-way big', 'Co-star', 'Stopper', '3&D', 'Elite role player', 'Glue guy', 'All-around', 'Scoring machine', 'Scorer', 'Three-level scorer', 'Two-way guard', 'Two-way wing']

for (const tag of PICK) {
  const men = PLAYERS.filter((p) => archetype(p) === tag)
  const top = [...men].sort((a, b) => b.ovr - a.ovr).slice(0, 6)
  console.log(`\n${tag}  (${men.length} cards)`)
  for (const p of top) {
    const a = p.attrs
    console.log(
      `  ${p.name.padEnd(28)} OVR ${String(p.ovr).padStart(2)}  O ${String(p.o_ovr).padStart(2)} D ${String(p.d_ovr).padStart(2)}  ` +
        `3pt ${String(a['3pt']).padStart(2)} rim ${String(a.rim).padStart(2)} mid ${String(a.mid).padStart(2)}  ` +
        `pass ${String(a.playvol).padStart(2)} vol ${String(a.volume).padStart(2)}  perdef ${String(a.perdef).padStart(2)} rimprot ${String(a.rimprot).padStart(2)}  ht ${a.height}`,
    )
  }
}
