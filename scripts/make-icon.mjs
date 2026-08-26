/**
 * Writes game7.ico and the PWA icons in public/. The drawing lives in icon.mjs.
 * Run: node scripts/make-icon.mjs
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

// Home-screen icons. The "any" pair keeps the transparent corners iOS wants
// behind its own rounded mask; the maskable one is opaque and shrinks the ball
// so Android's circle crop never bites into it.
write('public/icon-192.png', ball(192))
write('public/icon-512.png', ball(512))
write('public/icon-maskable-512.png', ball(512, { fill: 190 / 256, bg: NIGHT }))
