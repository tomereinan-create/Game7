/**
 * Writes game7.ico and the PWA icons in public/. The drawing lives in icon.mjs.
 * Run: node scripts/make-icon.mjs
 *
 * RETIRED FOR THE PNGs, 2026-10-24: the home-screen icons and public/ball7.png are cut from the Grok
 * render of the mark he took (scripts/design/candidates/logo-ball-hq/grok-1.png, the cut in
 * ball-1024.png beside it), not drawn here; only game7.ico is still written. Re-run the cut, not
 * this, when the mark changes.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ball, NIGHT, png, render } from './icon.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
function write(name, buf) {
  writeFileSync(join(root, name), buf)
  console.log(`wrote ${name} (${buf.length} B)`)
}

// The desktop icon: 64px, edge to edge, transparent corners.
const S = 64
const ico = png(S, render(S, 30.5, null))

// ICO wrapper: one PNG-payload entry (supported since Vista).
const dir = Buffer.alloc(6 + 16)
dir.writeUInt16LE(0, 0)
dir.writeUInt16LE(1, 2) // type: icon
dir.writeUInt16LE(1, 4) // one image
dir[6] = S
dir[7] = S
dir[8] = 0 // truecolour palette
dir[9] = 0
dir.writeUInt16LE(1, 10) // planes
dir.writeUInt16LE(32, 12) // bpp
dir.writeUInt32LE(ico.length, 14)
dir.writeUInt32LE(dir.length, 18)
write('game7.ico', Buffer.concat([dir, ico]))

// The home-screen icons are the render now (see the header); nothing more is written here.
