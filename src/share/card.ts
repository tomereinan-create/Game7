import { stampLabel, type ShareData, type ShareGame, type ShareSide } from './data'

/**
 * THE SHARE CARD (P10), drawn on a canvas: a 1080x1920 phone story and a 1200x630 link-preview
 * card, both off one `ShareData` (data.ts).
 *
 * The room is the app's: the black ground with the lit wash overhead and the warm spill in the
 * middle, League Gothic for every heading (a club, a man, the verdict, a stamp) and Space Grotesk
 * for every figure (his ruling, 2026-09-23: "Where ever there are stats on the app, anywhere, I
 * want Space Grotesk"). THE COLOUR LAW holds: in a head-to-head the gold is ours and the red is
 * theirs, the franchise bar is blue. No league or team logos, and nothing on it says what the
 * product is called except the address at its foot.
 *
 * NOTHING IS PLACED BY GUESSWORK. Every name is measured and shrunk to its column (a club he named
 * himself has no length to design for), the blocks are measured and then spread down the height
 * that is left, and a series of four games draws wider chips than a series of seven.
 */
export type CardFormat = 'story' | 'wide'
export const CARD_SIZE: Record<CardFormat, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  wide: { w: 1200, h: 630 },
}

const C = {
  bg: '#0b0a09',
  surface2: '#1d1916',
  rule: '#4a4038',
  hair: 'rgba(246, 244, 239, 0.09)',
  ink: '#f6f4ef',
  ink2: '#d6d0c8',
  muted: '#a39a91',
  dash: '#6a5d52',
  gold: '#f0b323',
  goldHi: '#ffd15c',
  goldInk: '#16130f',
  blue: '#2457c7',
  red: '#ef4a63',
}

const HEAD_FACE = '"League Gothic", "Arial Narrow", "Roboto Condensed", Impact, sans-serif'
const TEXT_FACE = '"Space Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
type Font = (px: number) => string
const head: Font = (px) => `400 ${px}px ${HEAD_FACE}`
const text = (weight: number): Font => (px) => `${weight} ${px}px ${TEXT_FACE}`
const bold = text(700)
const medium = text(500)
type Ctx = CanvasRenderingContext2D

/** A card name for the canvas: the typographer's apostrophe, "JORDAN ’96". */
const typeset = (s: string) => s.replace(/'/g, '’')

/* ---------- text: measure, fit, track ---------- */

/** Width of `s` with `track` px between letters (the canvas has no portable letter-spacing). */
function measure(ctx: Ctx, s: string, track = 0): number {
  if (!track) return ctx.measureText(s).width
  const chars = Array.from(s)
  return chars.reduce((w, ch) => w + ctx.measureText(ch).width, 0) + track * Math.max(0, chars.length - 1)
}

function draw(ctx: Ctx, s: string, x: number, y: number, align: CanvasTextAlign = 'left', track = 0) {
  ctx.textBaseline = 'alphabetic'
  if (!track) {
    ctx.textAlign = align
    ctx.fillText(s, x, y)
    return
  }
  const w = measure(ctx, s, track)
  let cx = align === 'center' ? x - w / 2 : align === 'right' || align === 'end' ? x - w : x
  ctx.textAlign = 'left'
  for (const ch of Array.from(s)) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + track
  }
}

/** How tall the capitals stand in the current font. */
function capOf(ctx: Ctx, px: number): number {
  const m = ctx.measureText('H')
  return m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : px * 0.72
}

/**
 * The largest size from `px` down to `min` at which `s` fits `maxW`, with `track` em between the
 * letters; past `min` the text is cut and ends in an ellipsis. Leaves the context set to the size.
 */
function fit(ctx: Ctx, s: string, maxW: number, px: number, min: number, font: Font, track = 0): { s: string; px: number } {
  const width = (t: string, p: number) => {
    ctx.font = font(p)
    return measure(ctx, t, track * p)
  }
  let p = px
  let w = width(s, p)
  if (w > maxW) {
    p = Math.max(min, Math.floor((p * maxW) / w))
    w = width(s, p)
    while (w > maxW && p > min) w = width(s, --p)
  }
  let out = s
  if (w > maxW) {
    const chars = Array.from(s)
    while (chars.length > 1 && width(chars.join('').trimEnd() + '…', p) > maxW) chars.pop()
    out = chars.join('').trimEnd() + '…'
  }
  ctx.font = font(p)
  return { s: out, px: p }
}

/* ---------- shapes ---------- */

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

function starPath(ctx: Ctx, cx: number, cy: number, R: number) {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? R * 0.46 : R
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
  }
  ctx.closePath()
}

/* ---------- the room ---------- */

function ground(ctx: Ctx, W: number, H: number, court: { cx: number; cy: number; r: number }) {
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  const big = Math.max(W, H)
  // the lit wash overhead (--wash-lit)
  let g = ctx.createRadialGradient(W / 2, -0.06 * H, 0, W / 2, -0.06 * H, big * 0.7)
  g.addColorStop(0, '#2b2540')
  g.addColorStop(1, 'rgba(11, 10, 9, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // the front door's warm spill (--arena-light)
  g = ctx.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.48, big * 0.55)
  g.addColorStop(0, 'rgba(255, 226, 178, 0.11)')
  g.addColorStop(0.5, 'rgba(255, 214, 150, 0.04)')
  g.addColorStop(1, 'rgba(255, 214, 150, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // the centre circle and the half-court line, chalk-faint, behind the score
  ctx.strokeStyle = 'rgba(246, 244, 239, 0.05)'
  ctx.lineWidth = Math.max(2, W / 360)
  ctx.beginPath()
  ctx.arc(court.cx, court.cy, court.r, 0, Math.PI * 2)
  ctx.moveTo(0, court.cy)
  ctx.lineTo(W, court.cy)
  ctx.stroke()
  // the vignette on the corners
  g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2)
  g.addColorStop(0, 'rgba(0, 0, 0, 0)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0.5)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

/** The double rule under the kicker (.rule2). */
function rule2(ctx: Ctx, x0: number, x1: number, y: number, s: number) {
  ctx.fillStyle = C.rule
  ctx.fillRect(x0, y, x1 - x0, 2 * s)
  ctx.fillRect(x0, y + 4 * s, x1 - x0, s)
}

/* ---------- the blocks ---------- */

interface Block {
  h: number
  draw: (y: number) => void
}

/**
 * Stand the blocks down the card: measured heights, and whatever height is left shared out as
 * gaps (no wider than `maxGap`, the rest above and below), so a series with no stars and no stamps
 * does not leave a hole where they would have been.
 */
function stack(blocks: Block[], top: number, bottom: number, maxGap: number): number[] {
  const used = blocks.reduce((a, b) => a + b.h, 0)
  const free = Math.max(0, bottom - top - used)
  const gap = blocks.length > 1 ? Math.min(maxGap, free / (blocks.length - 1)) : 0
  let y = top + (free - gap * (blocks.length - 1)) / 2
  return blocks.map((b) => {
    const at = y
    y += b.h + gap
    return at
  })
}

/** "LEVEL 42 OF 150" on the left, "BEST OF SEVEN" on the right, the rule under both. */
function kickerBlock(ctx: Ctx, d: ShareData, x0: number, x1: number, px: number, s: number): Block {
  return {
    h: px + 14 * s,
    draw: (y) => {
      ctx.fillStyle = C.muted
      const right = d.bestOf.toUpperCase()
      ctx.font = bold(px)
      const rw = measure(ctx, right, 0.16 * px)
      const left = fit(ctx, d.kicker.toUpperCase(), x1 - x0 - rw - 30 * s, px, px * 0.7, bold, 0.16)
      draw(ctx, left.s, x0, y + px * 0.8, 'left', 0.16 * left.px)
      ctx.font = bold(px)
      draw(ctx, right, x1, y + px * 0.8, 'right', 0.16 * px)
      rule2(ctx, x0, x1, y + px + 6 * s, s)
    },
  }
}

/** SERIES WON in gold, or SERIES LOST in the cream. */
function verdictBlock(ctx: Ctx, d: ShareData, cx: number, px: number, align: CanvasTextAlign = 'center'): Block {
  ctx.font = head(px)
  const cap = capOf(ctx, px)
  return {
    h: cap,
    draw: (y) => {
      ctx.font = head(px)
      ctx.fillStyle = d.won ? C.gold : C.ink2
      draw(ctx, d.won ? 'SERIES WON' : 'SERIES LOST', cx, y + cap, align, 0.02 * px)
    },
  }
}

/**
 * The series score, as the verdict on the screen draws it: our figure gold, the dash dim, theirs
 * red, our code on the left and theirs on the right. Shrinks as one piece if the codes are long.
 */
function scoreBlock(ctx: Ctx, d: ShareData, x0: number, x1: number, px0: number, codePx0: number, align: 'center' | 'left' = 'center'): Block {
  const avail = x1 - x0
  const layout = (px: number, codePx: number) => {
    ctx.font = bold(px)
    const parts = [String(d.wins), '–', String(d.losses)]
    const ws = parts.map((p, i) => {
      ctx.font = (i === 1 ? medium : bold)(px)
      return ctx.measureText(p).width
    })
    const gap = px * 0.07
    const mid = ws[0] + ws[1] + ws[2] + gap * 2
    ctx.font = bold(codePx)
    const cl = measure(ctx, d.us.code, 0.1 * codePx)
    const cr = measure(ctx, d.them.code, 0.1 * codePx)
    const side = px * 0.16
    return { px, codePx, parts, ws, gap, mid, cl, cr, side, total: cl + side + mid + side + cr }
  }
  let L = layout(px0, codePx0)
  if (L.total > avail) {
    const k = avail / L.total
    L = layout(Math.floor(px0 * k), Math.max(16, Math.floor(codePx0 * k)))
  }
  ctx.font = bold(L.px)
  const cap = capOf(ctx, L.px)
  return {
    h: cap,
    draw: (y: number) => {
      const base = y + cap
      let x = align === 'center' ? x0 + (avail - L.total) / 2 : x0
      ctx.font = bold(L.codePx)
      ctx.fillStyle = C.gold
      draw(ctx, d.us.code, x, base, 'left', 0.1 * L.codePx)
      x += L.cl + L.side
      const tones = [C.gold, C.dash, C.red]
      L.parts.forEach((p, i) => {
        // the dash is furniture between the two figures, so it is the lighter cut
        ctx.font = (i === 1 ? medium : bold)(L.px)
        ctx.fillStyle = tones[i]
        draw(ctx, p, x, base, 'left')
        x += L.ws[i] + (i < 2 ? L.gap : 0)
      })
      x += L.side
      ctx.font = bold(L.codePx)
      ctx.fillStyle = C.red
      draw(ctx, d.them.code, x, base, 'left', 0.1 * L.codePx)
    },
  }
}

/** The stars, drawn rather than typed (no face in the stack is sure to carry a ★). */
function starsBlock(ctx: Ctx, d: ShareData, cx: number, R: number, align: 'center' | 'left' = 'center'): Block | null {
  if (d.stars === null) return null
  const gap = R * 0.55
  const total = d.maxStars * 2 * R + (d.maxStars - 1) * gap
  return {
    h: 2 * R,
    draw: (y) => {
      let x = (align === 'center' ? cx - total / 2 : cx) + R
      for (let i = 0; i < d.maxStars; i++) {
        starPath(ctx, x, y + R * 1.04, R)
        if (i < d.stars!) {
          ctx.fillStyle = C.gold
          ctx.fill()
        } else {
          ctx.fillStyle = C.surface2
          ctx.fill()
          ctx.lineWidth = Math.max(2, R * 0.07)
          ctx.strokeStyle = C.rule
          ctx.stroke()
        }
        x += 2 * R + gap
      }
    },
  }
}

const TILTS = [-0.055, 0.04, -0.03]

/** The rubber stamps — UPSET, 0–3 COMEBACK, WON BY 1 — in one row, tilted, shrunk to fit. */
function stampsBlock(ctx: Ctx, d: ShareData, x0: number, x1: number, px0: number, align: 'center' | 'left' = 'center'): Block | null {
  if (!d.stamps.length) return null
  const labels = d.stamps.map((s) => stampLabel(s, d.toWin))
  const size = (px: number) => {
    ctx.font = head(px)
    const cap = capOf(ctx, px)
    const padX = px * 0.38
    const padY = px * 0.26
    const ws = labels.map((l) => measure(ctx, l, 0.05 * px) + padX * 2)
    const gap = px * 0.42
    return { px, cap, padY, ws, gap, h: cap + padY * 2, total: ws.reduce((a, b) => a + b, 0) + gap * (labels.length - 1) }
  }
  let S = size(px0)
  if (S.total > x1 - x0) S = size(Math.floor((px0 * (x1 - x0)) / S.total))
  return {
    // the tilt lifts a corner: leave room for it
    h: S.h + S.px * 0.3,
    draw: (y) => {
      let x = align === 'center' ? x0 + (x1 - x0 - S.total) / 2 : x0
      const cy = y + (S.h + S.px * 0.3) / 2
      labels.forEach((label, i) => {
        const w = S.ws[i]
        ctx.save()
        ctx.translate(x + w / 2, cy)
        ctx.rotate(TILTS[i % TILTS.length])
        ctx.strokeStyle = C.goldHi
        ctx.fillStyle = C.goldHi
        const lw = Math.max(3, S.px * 0.075)
        ctx.lineWidth = lw
        rrect(ctx, -w / 2, -S.h / 2, w, S.h, S.px * 0.12)
        ctx.stroke()
        ctx.lineWidth = Math.max(1, lw * 0.35)
        rrect(ctx, -w / 2 + lw * 1.7, -S.h / 2 + lw * 1.7, w - lw * 3.4, S.h - lw * 3.4, S.px * 0.08)
        ctx.stroke()
        ctx.font = head(S.px)
        draw(ctx, label, 0, S.cap / 2, 'center', 0.05 * S.px)
        ctx.restore()
        x += w + S.gap
      })
    },
  }
}

/**
 * THE FILMSTRIP, G1 to the last game played: a chip per game with our score over theirs and the
 * W or L under them. A game we won is a gold chip, a game we lost an outlined one — the fill, the
 * letter and the weight all say it, so the colour never has to. The clinching game wears a ring.
 * Our code and theirs head the two score rows on the left, so the card says whose figure is whose.
 */
function stripBlock(ctx: Ctx, d: ShareData, x0: number, x1: number, h: number, sz: { label: number; score: number; wl: number; code: number; gap: number; maxChip: number; r: number }): Block {
  ctx.font = bold(sz.code)
  const codeW = Math.max(measure(ctx, d.us.code, 0.1 * sz.code), measure(ctx, d.them.code, 0.1 * sz.code))
  const codeCol = Math.min(codeW, (x1 - x0) * 0.16) + sz.gap * 1.4
  const n = d.games.length
  const chipW = Math.min(sz.maxChip, (x1 - x0 - codeCol - sz.gap * (n - 1)) / n)
  const total = codeCol + chipW * n + sz.gap * (n - 1)
  const rows = { label: 0.2, us: 0.47, them: 0.7, wl: 0.94 }
  return {
    h,
    draw: (y) => {
      const left = x0 + (x1 - x0 - total) / 2
      const codeMax = codeCol - sz.gap * 1.4
      ctx.fillStyle = C.gold
      let f = fit(ctx, d.us.code, codeMax, sz.code, sz.code * 0.6, bold, 0.1)
      draw(ctx, f.s, left, y + h * rows.us, 'left', 0.1 * f.px)
      ctx.fillStyle = C.red
      f = fit(ctx, d.them.code, codeMax, sz.code, sz.code * 0.6, bold, 0.1)
      draw(ctx, f.s, left, y + h * rows.them, 'left', 0.1 * f.px)
      d.games.forEach((g, i) => chip(ctx, g, left + codeCol + i * (chipW + sz.gap), y, chipW, h, sz, rows, d.won && i === n - 1))
    },
  }
}

function chip(ctx: Ctx, g: ShareGame, x: number, y: number, w: number, h: number, sz: { label: number; score: number; wl: number; r: number }, rows: { label: number; us: number; them: number; wl: number }, clinch: boolean) {
  const lw = Math.max(2, sz.r * 0.22)
  if (clinch) {
    ctx.strokeStyle = C.goldHi
    ctx.lineWidth = lw
    rrect(ctx, x - lw * 2.2, y - lw * 2.2, w + lw * 4.4, h + lw * 4.4, sz.r + lw * 2)
    ctx.stroke()
  }
  rrect(ctx, x, y, w, h, sz.r)
  if (g.won) {
    ctx.fillStyle = C.gold
    ctx.fill()
  } else {
    ctx.fillStyle = C.surface2
    ctx.fill()
    ctx.strokeStyle = C.red
    ctx.lineWidth = lw
    ctx.stroke()
  }
  const cx = x + w / 2
  const pad = w * 0.1
  ctx.fillStyle = g.won ? C.goldInk : C.muted
  let f = fit(ctx, `G${g.n}`, w - pad * 2, sz.label, sz.label * 0.6, bold, 0.08)
  draw(ctx, f.s, cx, y + h * rows.label, 'center', 0.08 * f.px)
  // the winner's figure is the heavy one
  ctx.fillStyle = g.won ? C.goldInk : C.ink2
  f = fit(ctx, String(g.us), w - pad * 2, sz.score, sz.score * 0.55, g.won ? bold : medium)
  draw(ctx, f.s, cx, y + h * rows.us, 'center')
  ctx.fillStyle = g.won ? 'rgba(22, 19, 15, 0.72)' : C.red
  f = fit(ctx, String(g.them), w - pad * 2, sz.score, sz.score * 0.55, g.won ? medium : bold)
  draw(ctx, f.s, cx, y + h * rows.them, 'center')
  ctx.font = head(sz.wl)
  ctx.fillStyle = g.won ? C.goldInk : C.red
  draw(ctx, g.won ? 'W' : 'L', cx, y + h * rows.wl, 'center')
}

/**
 * THE TWO FIVES, side by side: the club's name over a blue franchise bar and ours under it, the
 * opponent's over a red one. Every name in both columns is set at ONE size — the largest at which
 * the longest of the ten fits its column — so the two lists read as a pair.
 */
function fivesBlock(ctx: Ctx, d: ShareData, x0: number, x1: number, sz: { head: number; row: number; rowH: number; gutter: number; bar: number }): Block {
  const colW = (x1 - x0 - sz.gutter) / 2
  ctx.font = head(sz.head)
  const headCap = capOf(ctx, sz.head)
  const names = [...d.us.five, ...d.them.five].map((n) => typeset(n).toUpperCase())
  let rowPx = sz.row
  for (const n of names) rowPx = Math.min(rowPx, fit(ctx, n, colW, rowPx, sz.row * 0.62, head, 0.01).px)
  const barY = headCap + sz.bar * 1.6
  const listY = barY + sz.bar + sz.rowH * 0.12
  const rows = Math.max(d.us.five.length, d.them.five.length, 1)
  const h = listY + rows * sz.rowH
  const column = (x: number, y: number, side: Pick<ShareSide, 'name' | 'five'>, tone: string) => {
    ctx.fillStyle = C.ink
    const f = fit(ctx, typeset(side.name).toUpperCase(), colW, sz.head, sz.head * 0.52, head, 0.01)
    draw(ctx, f.s, x, y + headCap, 'left', 0.01 * f.px)
    ctx.fillStyle = tone
    ctx.fillRect(x, y + barY, colW, sz.bar)
    side.five.forEach((name, i) => {
      const base = y + listY + (i + 1) * sz.rowH - sz.rowH * 0.24
      if (i > 0) {
        ctx.fillStyle = C.hair
        ctx.fillRect(x, y + listY + i * sz.rowH, colW, Math.max(1, sz.bar / 4))
      }
      // the surname in the cream, the season in the grey
      const full = typeset(name).toUpperCase()
      const cut = fit(ctx, full, colW, rowPx, rowPx, head, 0.01).s
      const m = cut.match(/^(.*?)( ’\d\d)$/)
      ctx.font = head(rowPx)
      ctx.fillStyle = C.ink
      draw(ctx, m ? m[1] : cut, x, base, 'left', 0.01 * rowPx)
      if (m) {
        const w = measure(ctx, m[1], 0.01 * rowPx) + 0.01 * rowPx
        ctx.fillStyle = C.muted
        draw(ctx, m[2], x + w, base, 'left', 0.01 * rowPx)
      }
    })
  }
  return {
    h,
    draw: (y) => {
      column(x0, y, d.us, C.blue)
      column(x0 + colW + sz.gutter, y, d.them, C.red)
      ctx.fillStyle = C.muted
      ctx.font = head(sz.head * 0.55)
      draw(ctx, 'VS', x0 + colW + sz.gutter / 2, y + headCap, 'center')
    },
  }
}

/** The address, the only mark on the card that says where it came from. */
function footBlock(ctx: Ctx, d: ShareData, x0: number, x1: number, labelPx: number, urlPx: number, inline: boolean): Block {
  const label = 'PLAY ME AT'
  if (inline) {
    return {
      h: urlPx,
      draw: (y) => {
        ctx.font = bold(labelPx)
        const lw = measure(ctx, label, 0.16 * labelPx) + labelPx * 0.8
        const u = fit(ctx, d.url, x1 - x0 - lw, urlPx, urlPx * 0.6, bold)
        const uw = measure(ctx, u.s)
        const start = x1 - lw - uw
        ctx.font = bold(labelPx)
        ctx.fillStyle = C.muted
        draw(ctx, label, start, y + urlPx * 0.8, 'left', 0.16 * labelPx)
        ctx.font = bold(u.px)
        ctx.fillStyle = C.ink
        draw(ctx, u.s, x1, y + urlPx * 0.8, 'right')
      },
    }
  }
  return {
    h: labelPx + urlPx * 1.25,
    draw: (y) => {
      const cx = (x0 + x1) / 2
      ctx.font = bold(labelPx)
      ctx.fillStyle = C.muted
      draw(ctx, label, cx, y + labelPx * 0.8, 'center', 0.18 * labelPx)
      const u = fit(ctx, d.url, x1 - x0, urlPx, urlPx * 0.55, bold)
      ctx.fillStyle = C.ink
      draw(ctx, u.s, cx, y + labelPx + urlPx * 1.05, 'center')
    },
  }
}

/* ---------- the two formats ---------- */

/** 1080 x 1920: one column, read top to bottom, big enough to read on a phone held at arm's length. */
function drawStory(ctx: Ctx, d: ShareData) {
  const { w: W, h: H } = CARD_SIZE.story
  const M = 80
  const x0 = M
  const x1 = W - M
  const score = scoreBlock(ctx, d, x0, x1, 290, 46)
  const blocks = [
    kickerBlock(ctx, d, x0, x1, 28, 1),
    verdictBlock(ctx, d, W / 2, 150),
    score,
    starsBlock(ctx, d, W / 2, 50),
    stampsBlock(ctx, d, x0, x1, 66),
    stripBlock(ctx, d, x0, x1, 212, { label: 26, score: 46, wl: 46, code: 28, gap: 12, maxChip: 158, r: 14 }),
    fivesBlock(ctx, d, x0, x1, { head: 60, row: 60, rowH: 78, gutter: 56, bar: 8 }),
    footBlock(ctx, d, x0, x1, 26, 44, false),
  ].filter((b): b is Block => !!b)
  // A story's own furniture covers its top and foot (the profile bar, the reply field), so the
  // card keeps its words inside the middle of the frame.
  const ys = stack(blocks, 120, H - 170, 92)
  const at = ys[blocks.indexOf(score)]
  ground(ctx, W, H, { cx: W / 2, cy: at + score.h / 2, r: 300 })
  blocks.forEach((b, i) => b.draw(ys[i]))
}

/**
 * 1200 x 630, the shape a link preview takes: the verdict and the score on the left, the two fives
 * on the right, the stamps and the filmstrip across the foot. Read at half size in a feed, so
 * nothing on it is drawn under 20px.
 */
function drawWide(ctx: Ctx, d: ShareData) {
  const { w: W, h: H } = CARD_SIZE.wide
  const M = 56
  const x0 = M
  const x1 = W - M
  const split = x0 + 470
  const right0 = split + 50
  const verdict = verdictBlock(ctx, d, x0, 66, 'left')
  const score = scoreBlock(ctx, d, x0, split, 150, 26, 'left')
  const stars = starsBlock(ctx, d, x0, 21, 'left')
  const left = [verdict, score, stars].filter((b): b is Block => !!b)
  const leftGap = 22
  const leftH = left.reduce((a, b) => a + b.h, 0) + leftGap * (left.length - 1)
  const fives = fivesBlock(ctx, d, right0, x1, { head: 34, row: 31, rowH: 38, gutter: 28, bar: 5 })
  const mainH = Math.max(leftH, fives.h)
  const main: Block = {
    h: mainH,
    draw: (y) => {
      let ly = y + (mainH - leftH) / 2
      for (const b of left) {
        b.draw(ly)
        ly += b.h + leftGap
      }
      fives.draw(y + (mainH - fives.h) / 2)
    },
  }
  const blocks = [
    kickerBlock(ctx, d, x0, x1, 19, 0.7),
    main,
    stampsBlock(ctx, d, x0, x1, 34, 'left'),
    stripBlock(ctx, d, x0, x1, 112, { label: 18, score: 32, wl: 24, code: 21, gap: 10, maxChip: 150, r: 9 }),
    footBlock(ctx, d, x0, x1, 15, 22, true),
  ].filter((b): b is Block => !!b)
  const ys = stack(blocks, 34, H - 28, 26)
  ground(ctx, W, H, { cx: x0 + 200, cy: ys[1] + mainH / 2, r: 170 })
  blocks.forEach((b, i) => b.draw(ys[i]))
}

/* ---------- the render ---------- */

/**
 * WAIT FOR THE FACES. A canvas draws in whatever font is loaded at the moment it draws, and the
 * two faces come from Google Fonts — so the card asks for both, with the very characters it is
 * about to set (Jokić and Porziņģis need the Latin Extended subset), and gives up after three
 * seconds rather than hold a share hostage to a slow network. The fallbacks in each stack are
 * condensed and plain respectively, and every name is measured in whatever arrived.
 */
async function fontsReady(sample: string): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts?.load) return
  const want = [head(64), bold(64), medium(64)]
  await Promise.race([
    Promise.all(want.map((f) => fonts.load(f, sample).catch(() => []))),
    new Promise((r) => setTimeout(r, 3000)),
  ])
}

function sampleText(d: ShareData): string {
  return [d.kicker, d.bestOf, d.us.name, d.them.name, d.us.code, d.them.code, ...d.us.five, ...d.them.five, d.url, 'SERIES WON LOST PLAY ME AT VS UPSET COMEBACK BY 0123456789–’…']
    .map(typeset)
    .join(' ')
    .toUpperCase()
}

/** Draw one format onto a context the caller owns — the dev preview uses this to show its work. */
export function drawShareCard(ctx: Ctx, data: ShareData, format: CardFormat) {
  if (format === 'story') drawStory(ctx, data)
  else drawWide(ctx, data)
}

/** The card as a PNG, exactly 1080x1920 ('story') or 1200x630 ('wide'). */
export async function renderShareCard(data: ShareData, format: CardFormat): Promise<Blob> {
  await fontsReady(sampleText(data))
  const { w, h } = CARD_SIZE[format]
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser has no 2D canvas.')
  drawShareCard(ctx, data, format)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The card could not be encoded.'))), 'image/png'))
}
