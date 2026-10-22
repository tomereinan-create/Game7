import { collectSave, encodeSave, hasProgress } from '../src/state/savecode'

/**
 * THE MOVER (P3). Served at the game's OLD address once the game itself has moved to its own
 * domain. Saves live in the old origin's localStorage, which the new domain cannot read — so this
 * page, running on the old origin, reads them, writes them into a save code, and hands the player
 * to the new address with the code in the hash (`#import=`), where the game loads it on arrival
 * (src/ui/Escape.tsx, ImportPrompt). A player with nothing saved is simply sent on.
 *
 * Built by scripts/build-mover.mjs, which bundles this file and src/state/savecode.ts into one
 * inline script; TARGET is the new address, from src/site.ts.
 */
declare const TARGET: string

async function go() {
  const u = new URL(TARGET)
  /* A LINK THAT WAS MINTED ON THE OLD ADDRESS KEEPS WHAT IT CARRIED (the live check, 2026-10-22: a
     challenge shared in the twenty minutes before the domain was live landed on the front door with
     no challenge). Its share tag, its own ref and its `c=` cross over; the save code joins the hash
     with '&', which both the challenge and the import readers take. */
  const here = new URL(location.href)
  for (const k of ['s', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const v = here.searchParams.get(k)
    if (v) u.searchParams.set(k, v)
  }
  u.searchParams.set('ref', here.searchParams.get('ref') || 'mover')
  const c = /(?:^#|&)c=([^&]+)/.exec(here.hash)?.[1] ?? here.searchParams.get('c')
  const hash: string[] = c ? [`c=${c}`] : []
  try {
    if (hasProgress()) hash.push(`import=${await encodeSave(collectSave())}`)
  } catch {
    /* storage blocked, or no CompressionStream: go on without the save rather than not at all */
  }
  const url = u.href + (hash.length ? `#${hash.join('&')}` : '')
  const a = document.getElementById('go')
  if (a) a.setAttribute('href', url)
  location.replace(url)
}
void go()
