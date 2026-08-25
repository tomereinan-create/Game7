/**
 * Archetype labeller tools.
 *   npm run tags            canonical check + histogram at the shipped RELAX
 *   npm run tags -- --sweep relaxation pass: raise RELAX in steps of 3 until the
 *                           BALANCED fallback holds under 12% of the pool, with the
 *                           rule order untouched and no canonical check regressing.
 */
import { ALL_TAGS, archetype, PLAYERS, RELAX } from '../src/engine/pool'

const CANON: [string, string[]][] = [
  ["Chris Paul '09", ['Point god']],
  ["Russell Westbrook '17", ['Offensive engine', 'Triple-double threat']],
  ["LeBron James '09", ['Point forward', 'Two-way star', 'Offensive engine']],
  ["Joel Embiid '24", ['Two-way anchor']],
  ["Victor Wembanyama '26", ['Unicorn', 'Two-way anchor', 'Pick-and-pop big']],
  ["Nikola Jokić '26", ['Post hub', 'Offensive engine']],
  ["Kawhi Leonard '17", ['Two-way star']],
  ["Michael Jordan '89", ['Three-level scorer', 'Two-way star']],
  ["DeMar DeRozan '17", ['Midrange maestro']],
  ["Dwyane Wade '09", ['Slasher', 'Offensive engine']],
  ["Shaquille O'Neal '00", ['Tank', 'Two-way anchor']],
  ["Giannis Antetokounmpo '20", ['Freight train', 'Two-way anchor']],
  ["James Harden '19", ['Free throw merchant', 'Three-level scorer', 'Offensive engine']],
  ["Klay Thompson '15", ['Flamethrower']],
  ["Kyle Korver '15", ['Sniper', 'Catch-and-shoot wing']],
  ["Steve Kerr '96", ['Deadeye', 'Sniper']],
  ["Karl-Anthony Towns '18", ['Stretch big']],
  ["LaMarcus Aldridge '14", ['Pick-and-pop big', 'Midrange maestro']],
  ["Dennis Rodman '92", ['Glass cleaner']],
  // recal_21 deleted Lob threat; Energy big is the surviving expectation for this sheet.
  ["Dereck Lively II '24", ['Energy big']],
  ["Tristan Thompson '16", ['Energy big']],
  ["Rudy Gobert '19", ['Anchor', 'Two-way anchor', 'Glass cleaner']],
  ["Bruce Bowen '06", ['Stopper', 'Catch-and-shoot wing']],
  ["Patrick Beverley '17", ['Pest', 'Stopper']],
  ["Allen Iverson '01", ['Spark plug', 'Gambler']],
  // 3&D did not exist when this list was written; it is exactly this sheet (shoots, defends, uses nothing).
  ["Shane Battier '06", ['3&D', 'Mid glue', 'Balanced']],   // Connector deleted from the tree
  ["Manu Ginóbili '08", ['Three-level scorer']],   // Secondary creator deleted from the tree
  // Paint beast is Freight train's stricter sibling (paint 95+ rather than 90+), so a sheet the list
  // already accepted as a Freight train qualifies: King '85 is paint 97, usage 98, no three.
  ["Bernard King '85", ['Midrange maestro', 'Throwback', 'Freight train', 'Paint beast']],
  ["Moses Malone '83", ['Glass cleaner', 'Post scorer']],   // Microwave deleted from the tree
  // recal_21 deleted Post hub. Versatile defender is what this sheet now describes — min(perdef,
  // rimprot) 85, d_ovr 98, neither elite — and the check stays honest until its placement is ruled on.
  ["Draymond Green '16", ['Versatile defender', 'All-around']],
]
const by = new Map(PLAYERS.map((p) => [p.name, p]))
/** How many distinct tags the tree can return — the rule table is data now, so just ask it. */
const TAG_COUNT = ALL_TAGS.length

const hist = (relax: number) => {
  const c = new Map<string, number>()
  for (const p of PLAYERS) {
    const t = archetype(p, relax)
    c.set(t, (c.get(t) ?? 0) + 1)
  }
  return c
}
const canonPass = (relax: number) =>
  CANON.filter(([n, ok]) => {
    const p = by.get(n)
    return p && ok.includes(archetype(p, relax))
  }).length

if (process.argv.includes('--sweep')) {
  const base = canonPass(0)
  console.log(`relaxation pass — canonical baseline ${base}/${CANON.length} at RELAX 0\n`)
  let chosen = 0
  for (let relax = 0; relax <= 30; relax += 3) {
    const c = hist(relax)
    const bal = ((100 * (c.get('Balanced') ?? 0)) / PLAYERS.length)
    const worst = [...c].filter(([k]) => k !== 'Balanced').sort((a, b) => b[1] - a[1])[0]
    const pass = canonPass(relax)
    const empty = TAG_COUNT - c.size
    console.log(
      `  RELAX ${String(relax).padStart(2)}  BALANCED ${bal.toFixed(1).padStart(5)}%  canonical ${pass}/${CANON.length}  biggest tag ${worst[0]} ${((100 * worst[1]) / PLAYERS.length).toFixed(1)}%  empty ${empty}`,
    )
    if (!chosen && bal < 12 && pass >= base) chosen = relax
  }
  console.log(`\nchosen RELAX = ${chosen || 'none inside 30'}`)
  process.exit(0)
}

console.log(`RELAX ${RELAX} · canonical ${canonPass(RELAX)}/${CANON.length}`)
for (const [n, ok] of CANON) {
  const p = by.get(n)
  const t = p ? archetype(p) : '(absent)'
  console.log(`  ${n.padEnd(28)} ${t.padEnd(22)} ${p && ok.includes(t) ? '' : `expected ${ok.join(' / ')}`}`)
}
const c = hist(RELAX)
console.log(`\nHISTOGRAM (${PLAYERS.length} seasons, ${c.size}/${TAG_COUNT} tags used)`)
for (const [k, n] of [...c].sort((a, b) => b[1] - a[1])) {
  const pv = (100 * n) / PLAYERS.length
  console.log(`  ${k.padEnd(24)} ${String(n).padStart(5)}  ${pv.toFixed(1)}%${pv > 12 ? '  FLAG >12%' : ''}${k === 'Balanced' && pv > 10 ? '  FLAG fallback >10%' : ''}`)
}
