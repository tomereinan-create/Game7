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
  u.searchParams.set('ref', 'mover')
  let url = u.href
  try {
    if (hasProgress()) url += `#import=${await encodeSave(collectSave())}`
  } catch {
    /* storage blocked, or no CompressionStream: go on without the save rather than not at all */
  }
  const a = document.getElementById('go')
  if (a) a.setAttribute('href', url)
  location.replace(url)
}
void go()
