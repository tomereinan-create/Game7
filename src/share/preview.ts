import { CARD_SIZE, renderShareCard, type CardFormat } from './card'
import { altText, bestOfLabel, cardNames, proseName, shareText, stampsFor, teamLabel, type ShareData, type ShareGame } from './data'
import { SITE } from '../site'
import { shareLink } from './link'

/**
 * THE SHARE CARD, PREVIEWED — DEV ONLY. `?sharepreview=1` on the dev server draws both formats
 * for four fixed series instead of the app, so a session that cannot see a phone can screenshot
 * the card. main.tsx only imports this behind `import.meta.env.DEV`, so a build never ships it.
 *
 * The four are the shapes the renderer has to survive: a seven-game comeback that earns every
 * stamp, a long-named exhibition loss in six, a campaign sweep, and the 1v1 bid's chairs.
 */
interface Sample {
  label: string
  kicker: string
  exhibition: boolean
  us: { name: string; code: string; five: string[] }
  them: { team: string; season?: number; code: string; five: string[] }
  /** [us, them] per game */
  games: [number, number][]
  toWin?: number
  winChance: number
  stars: number | null
}

const SAMPLES: Sample[] = [
  {
    label: 'Campaign win 4–3: upset, 0–3 comeback, Game 7 by 1',
    kicker: 'Level 38 of 150',
    exhibition: false,
    us: { name: 'Salt Lake City Sevens', code: 'SLC', five: ["Michael Jordan '96", "Nikola Jokić '23", "Shai Gilgeous-Alexander '25", "Marvin Bagley III '26", "Kristaps Porziņģis '23"] },
    them: { team: "Golden State Warriors '16", season: 2016, code: 'GSW', five: ["Stephen Curry '16", "Andre Iguodala '16", "Klay Thompson '16", "Draymond Green '16", "Andrew Bogut '16"] },
    games: [[98, 104], [101, 112], [95, 99], [110, 102], [107, 96], [104, 100], [112, 111]],
    winChance: 0.31,
    stars: 1,
  },
  {
    label: 'Exhibition loss 2–4, long names, two Williamses',
    kicker: 'Exhibition',
    exhibition: true,
    us: { name: 'Dnipropetrovsk Wanderers', code: 'DNI', five: ["Giannis Antetokounmpo '20", "Jalen Williams '24", "Jaylin Williams '24", "Michael Porter Jr. '23", "Kentavious Caldwell-Pope '23"] },
    them: { team: "'96 Chicago Bulls", code: 'CHI', five: ["Ron Harper '96", "Michael Jordan '96", "Scottie Pippen '96", "Dennis Rodman '96", "Luc Longley '96"] },
    games: [[99, 108], [114, 109], [92, 100], [101, 97], [88, 103], [96, 99]],
    winChance: 0.22,
    stars: null,
  },
  {
    label: 'Campaign sweep 4–0, three stars',
    kicker: 'Level 4 of 150',
    exhibition: false,
    us: { name: 'Boston Sevens', code: 'BOS', five: ["Magic Johnson '89", "Kobe Bryant '03", "LeBron James '13", "Tim Duncan '03", "Shaquille O'Neal '00"] },
    them: { team: 'Washington Wizards', season: 2026, code: 'WAS', five: ["Bub Carrington '26", "Tre Johnson '26", "Kyshawn George '26", "Marvin Bagley III '26", "Alex Sarr '26"] },
    games: [[121, 92], [118, 101], [109, 99], [127, 104]],
    winChance: 0.97,
    stars: 3,
  },
  {
    label: '1v1 Bid win 4–1',
    kicker: '1v1 Bid',
    exhibition: true,
    us: { name: 'Player 1', code: 'P1', five: ["Stephen Curry '16", "Dwyane Wade '09", "Kevin Durant '14", "Kevin Garnett '04", "David Robinson '94"] },
    them: { team: 'The Machine', code: 'CPU', five: ["Chris Paul '08", "Tracy McGrady '03", "Larry Bird '86", "Dirk Nowitzki '06", "Hakeem Olajuwon '93"] },
    games: [[103, 97], [99, 101], [111, 108], [106, 94], [100, 99]],
    winChance: 0.58,
    stars: null,
  },
]

function dataOf(s: Sample): ShareData {
  const toWin = s.toWin ?? 4
  const games: ShareGame[] = s.games.map(([us, them], i) => ({ n: i + 1, us, them, won: us > them }))
  const wins = games.filter((g) => g.won).length
  const losses = games.length - wins
  const won = wins === toWin
  return {
    kicker: s.kicker,
    bestOf: bestOfLabel(toWin),
    exhibition: s.exhibition,
    us: { name: s.us.name, code: s.us.code, five: cardNames(s.us.five) },
    them: { name: teamLabel(s.them.team, s.them.season), code: s.them.code, five: cardNames(s.them.five), prose: proseName(s.them.team, s.them.season, s.exhibition) },
    wins,
    losses,
    won,
    toWin,
    games,
    stars: s.stars,
    maxStars: toWin <= 2 ? 2 : 3,
    stamps: stampsFor(games, won, toWin, s.winChance),
    winChance: s.winChance,
    // the address production prints, not this dev server's: the card is previewed at its real width
    url: SITE.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
  }
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = '') => {
  const e = document.createElement(tag)
  e.style.cssText = css
  if (text) e.textContent = text
  return e
}

export function mountSharePreview(root: HTMLElement) {
  document.title = 'Share card preview'
  document.body.style.cssText = 'margin:0;background:#050404;color:#f6f4ef;font:14px/1.45 "Space Grotesk",system-ui,sans-serif'
  root.style.cssText = 'max-width:none;padding:24px'
  root.replaceChildren()
  SAMPLES.forEach((s, i) => {
    const d = dataOf(s)
    const sec = el('section', 'margin:0 0 48px;padding-bottom:32px;border-bottom:1px solid #2a2320')
    sec.append(el('h2', 'margin:0 0 12px;font:400 32px "League Gothic",sans-serif;letter-spacing:.02em', `${i + 1}. ${s.label}`))
    const row = el('div', 'display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start')
    const formats: CardFormat[] = ['story', 'wide']
    for (const f of formats) {
      const box = el('figure', 'margin:0')
      const img = el('img', `display:block;width:${f === 'story' ? 405 : 720}px;max-width:100%;height:auto;border:1px solid #2a2320`)
      const cap = el('figcaption', 'margin-top:6px;color:#a39a91;font-size:12px', `${f} · drawing…`)
      box.append(img, cap)
      row.append(box)
      renderShareCard(d, f)
        .then((b) => {
          img.src = URL.createObjectURL(b)
          img.alt = altText(d)
          img.onload = () => {
            const want = CARD_SIZE[f]
            const ok = img.naturalWidth === want.w && img.naturalHeight === want.h
            cap.textContent = `${f} · ${img.naturalWidth}×${img.naturalHeight}${ok ? '' : ` (WANTED ${want.w}×${want.h})`} · ${Math.round(b.size / 1024)} KB`
          }
        })
        .catch((e) => (cap.textContent = `${f} · failed: ${String(e)}`))
    }
    sec.append(row)
    const pre = el('pre', 'margin:16px 0 0;padding:12px;background:#12100e;border:1px solid #2a2320;white-space:pre-wrap;font:13px/1.5 "Space Grotesk",system-ui,sans-serif')
    pre.textContent = `${shareText(d, shareLink({ s: 'preview' + (i + 1), ref: 'x' }))}\n\nalt: ${altText(d)}`
    sec.append(pre)
    root.append(sec)
  })
}
