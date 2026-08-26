/**
 * A basketball, drawn with arithmetic so the repo carries no binary art.
 * Everything that needs an icon — the desktop .ico, the home-screen PNGs, the
 * Android launcher — draws from here at the size it needs.
 */
import { deflateSync } from 'node:zlib'

const SS = 3 // supersampling, for edges that aren't staircases

const BALL = [224, 123, 57]
const BALL_DARK = [178, 88, 36]
const SEAM = [32, 16, 8]
export const NIGHT = [20, 18, 16] // #141210, the app's theme colour

/**
 * Pixels of a ball of radius R centred in an S-box. Every measurement below was
 * tuned against R = 30.5, so it scales through u and the drawing survives at
 * any size. `bg` fills the corners; null leaves them transparent.
 */
export function render(S, R, bg) {
  const C = S / 2
  const u = R / 30.5

  // Two off-centre circles carve the classic curved seams. They pass through the
  // poles by construction; ARC_DX sets how far they bow out at the equator
  // (bulge = hypot(ARC_DX, R) - ARC_DX, so smaller ARC_DX means a wider lens).
  const ARC_DX = 21 * u
  const ARC_R = Math.hypot(ARC_DX, R)
  const SEAM_W = 1.7 * u
  const RIM = 2.5 * u

  /** Colour of one sub-sample, or null for transparent. */
  function sample(x, y) {
    const dx = x - C
    const dy = y - C
    const d = Math.hypot(dx, dy)
    if (d > R) return null

    const seam =
      Math.abs(dx) < SEAM_W ||
      Math.abs(dy) < SEAM_W ||
      Math.abs(Math.hypot(x - (C - ARC_DX), dy) - ARC_R) < SEAM_W ||
      Math.abs(Math.hypot(x - (C + ARC_DX), dy) - ARC_R) < SEAM_W
    if (seam) return SEAM
    if (d > R - RIM) return BALL_DARK
    // Light from the upper left.
    const lift = Math.max(0, 1 - (dx + dy + 52 * u) / (120 * u)) * 26
    return BALL.map((c) => Math.min(255, Math.round(c + lift)))
  }

  const raw = Buffer.alloc(S * (S * 4 + 1))
  let o = 0
  for (let y = 0; y < S; y++) {
    raw[o++] = 0 // filter: none
    for (let x = 0; x < S; x++) {
      let r = 0
      let g = 0
      let b = 0
      let hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
          if (px) {
            r += px[0]
            g += px[1]
            b += px[2]
            hits++
          }
        }
      }
      const n = SS * SS
      const cover = hits / n
      if (bg) {
        // Composite the ball over the background; the result is fully opaque.
        for (let i = 0; i < 3; i++) {
          const ball = hits ? [r, g, b][i] / hits : 0
          raw[o++] = Math.round(ball * cover + bg[i] * (1 - cover))
        }
        raw[o++] = 255
      } else {
        raw[o++] = hits ? Math.round(r / hits) : 0
        raw[o++] = hits ? Math.round(g / hits) : 0
        raw[o++] = hits ? Math.round(b / hits) : 0
        raw[o++] = Math.round(cover * 255)
      }
    }
  }
  return raw
}

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return (buf) => {
    let c = -1
    for (const byte of buf) c = t[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(body))
  return Buffer.concat([len, body, crc])
}

export function png(S, raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0)
  ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour + alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A square PNG of the ball. `fill` is how much of the box the ball spans. */
export function ball(size, { fill = 30.5 / 32, bg = null } = {}) {
  return png(size, render(size, (size * fill) / 2, bg))
}
