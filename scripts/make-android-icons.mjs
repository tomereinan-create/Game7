/**
 * Draws the launcher icons into the generated Android project, replacing the
 * Capacitor placeholder. Run after `cap add android`:
 *   node scripts/make-android-icons.mjs
 *
 * Android wants the same ball three ways. The legacy pair is opaque and square,
 * because old launchers paint it as-is and newer ones may mask it to a circle.
 * The adaptive foreground is transparent and much smaller: its image is 108dp
 * but only the middle 66dp is guaranteed to survive whatever shape the phone
 * crops to, so the ball sits well inside that.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ball, NIGHT } from './icon.mjs'

const RES = join(dirname(fileURLToPath(import.meta.url)), '..', 'android/app/src/main/res')

// One row per density: the legacy icon's size, then the adaptive foreground's.
const DENSITIES = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
]

const LEGACY_FILL = 0.8 // leaves room for a round mask
const ADAPTIVE_FILL = 60 / 108 // inside the 66dp the platform guarantees

let n = 0
for (const [density, legacy, adaptive] of DENSITIES) {
  const dir = join(RES, `mipmap-${density}`)
  mkdirSync(dir, { recursive: true })

  const square = ball(legacy, { fill: LEGACY_FILL, bg: NIGHT })
  writeFileSync(join(dir, 'ic_launcher.png'), square)
  writeFileSync(join(dir, 'ic_launcher_round.png'), square)
  writeFileSync(join(dir, 'ic_launcher_foreground.png'), ball(adaptive, { fill: ADAPTIVE_FILL }))
  n += 3
}

// The adaptive icon's background is a flat colour, the app's own night.
const hex = `#${NIGHT.map((c) => c.toString(16).padStart(2, '0')).join('')}`
const values = join(RES, 'values')
mkdirSync(values, { recursive: true })
writeFileSync(
  join(values, 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${hex}</color>
</resources>
`,
)

console.log(`wrote ${n} launcher icons across ${DENSITIES.length} densities, background ${hex}`)
