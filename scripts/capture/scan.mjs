/**
 * SEED SCAN for wheel-run videos: play creator-mode runs hands-free on a fast-forwarded clock and
 * report how each seed's series ends, so a video can feature a run whose Game 7 is close — without
 * sitting through each run in real time.
 *
 *   node scripts/capture/scan.mjs --app http://localhost:5195/ --level 1 --from 1 --to 60
 *   node scripts/capture/scan.mjs --app http://localhost:5195/ --level 12 --seeds 4,9,31 --json
 *
 * Each seed opens `?creator=1&auto=1&framed=1&seed=S&level=L` with Playwright's fake clock installed,
 * then advances the clock until the series settles (document.body.dataset.creatorDone). The run is
 * the one clip.mjs records from the same URL: the draft, the opponent and every game are decided by
 * the seed alone, and the clock only skips the waiting.
 */
import { launch } from './browser.mjs'

const argv = process.argv.slice(2)
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d)
const APP = opt('app', 'http://localhost:5195/')
const LEVEL = Number(opt('level', 1))
const seeds = opt('seeds')
  ? opt('seeds').split(',').map(Number)
  : Array.from({ length: Number(opt('to', 20)) - Number(opt('from', 1)) + 1 }, (_, i) => Number(opt('from', 1)) + i)
const JSONOUT = argv.includes('--json')

const browser = await launch({ headless: true })
const out = []
try {
  for (const seed of seeds) {
    const page = await browser.newPage({ viewport: { width: 432, height: 768 } })
    await page.clock.install()
    const u = new URL(APP)
    for (const [k, v] of Object.entries({ creator: 1, auto: 1, framed: 1, seed, level: LEVEL })) u.searchParams.set(k, String(v))
    await page.goto(u.href, { waitUntil: 'domcontentloaded' })
    let done = false
    for (let i = 0; i < 400 && !done; i++) {
      await page.clock.runFor(2000)
      done = await page.evaluate(() => document.body.dataset.creatorDone === '1')
    }
    const r = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('.gt b')].map((b) => b.textContent.replace(/\s/g, ''))
      const text = document.getElementById('root')?.innerText ?? ''
      const five = [...document.querySelectorAll('.duel-line b, .who b')].slice(0, 5).map((b) => b.textContent)
      return { chips, verdict: (/Series (won|lost)[^\n]*/.exec(text) ?? [''])[0], head: text.split('\n').slice(0, 3).join(' · ') }
    })
    const g7 = r.chips.length === 7 ? r.chips[6].split(/[–-]/).map(Number) : null
    const row = { seed, level: LEVEL, done, games: r.chips.length, verdict: r.verdict, g7: r.chips[6] ?? null, g7margin: g7 ? g7[0] - g7[1] : null, chips: r.chips.join(' '), head: r.head }
    out.push(row)
    if (!JSONOUT) console.log(`L${LEVEL} seed ${seed}: ${done ? '' : '(did not settle) '}${row.verdict} · ${row.chips}`)
    await page.close()
  }
} finally {
  await browser.close()
}
if (JSONOUT) console.log(JSON.stringify(out, null, 2))
else {
  const g7s = out.filter((r) => r.games === 7).sort((a, b) => Math.abs(a.g7margin) - Math.abs(b.g7margin))
  console.log(`\n${g7s.length} of ${out.length} went to Game 7; closest: ${g7s.slice(0, 5).map((r) => `seed ${r.seed} (${r.g7}, ${r.verdict})`).join(' · ')}`)
}
