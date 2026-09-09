import { useState } from 'react'
import STATS from '../data/stats.json'
import type { AttrKey, Player, StatLine } from '../engine/types'
import { Advanced } from './Advanced'
import { HeatHex } from './HeatHex'

export const LINES = STATS as Record<string, StatLine | null>

/** Ratings live in 1-99; the design maps h = (v-20)/80 so low reads as low, not missing. */
export const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - 20) / 80) * 100))}%`

const GLYPH_KEYS = ['in', 'out', 'id', 'pd'] as const   // the four Lineup axes, not the attribute sheet

/**
 * The shape glyph: four 9x22 bars on faint rails with a 1px baseline, fixed
 * order In · Out │ ID · PD, taught once per list header. Fill follows owner
 * via the row's class (neutral ink-2, gold when yours, ice when theirs).
 */
export function Glyph({ p, tone }: { p: Player; tone?: 'you' | 'them' }) {
  return (
    <span className={`glyph ${tone ? `g-${tone}` : ''}`} aria-hidden="true">
      {GLYPH_KEYS.map((k) => (
        <span className="gtrack" key={k}>
          <span className="gfill" style={{ height: pct(p[k]) }} />
        </span>
      ))}
    </span>
  )
}

/**
 * The 17 attributes from data/build_ratings.py, under their own key names,
 * grouped the way a drafter reads a player. Nothing invented, nothing renamed.
 */
export const GROUPS: { title: string; keys: { k: AttrKey; label: string; mark?: boolean }[] }[] = [
  {
    title: 'Scoring',
    keys: [
      { k: 'rim', label: 'paint', mark: true },
      { k: 'mid', label: 'mid', mark: true },
      { k: '3pt', label: '3pt' },
      { k: 'ft', label: 'ft' },
      { k: 'fouldraw', label: 'fouldraw' },
      { k: 'volume', label: 'volume' },
      { k: 'efficiency', label: 'efficiency' },
    ],
  },
  {
    title: 'Defence',
    keys: [
      { k: 'rimprot', label: 'rimprot' },
      { k: 'perimdisrupt', label: 'perimdisrupt' },
      { k: 'perdef', label: 'perdef' },
    ],
  },
  {
    title: 'Playmaking',
    keys: [
      { k: 'playvol', label: 'playvol' },
      { k: 'ballsec', label: 'ballsec' },
    ],
  },
  {
    title: 'Rebounding',
    keys: [
      { k: 'orb', label: 'orb' },
      { k: 'drb', label: 'drb' },
    ],
  },
  {
    title: 'Intangibles',
    keys: [
      { k: 'discipline', label: 'discipline' },
      { k: 'durability', label: 'durability' },
    ],
  },
]

/** The same 17, flat, in group order — for the Database sort rail. */
export const SHEET: { k: AttrKey; label: string; mark?: boolean }[] = GROUPS.flatMap((g) => g.keys)

/** The real season line, as a ruled ledger row. */
/** The season box line. Exported so the man-band prints the same cells the detail panel does. */
export const BOX: { label: string; k: keyof StatLine }[] = [
  { label: 'PTS', k: 'ppg' },
  { label: 'REB', k: 'rpg' },
  { label: 'AST', k: 'apg' },
  { label: 'STL', k: 'spg' },
  { label: 'BLK', k: 'bpg' },
  { label: 'TOV', k: 'topg' },
  { label: 'FG%', k: 'fgp' },
  { label: '3P%', k: 'tpp' },
  { label: 'FT%', k: 'ftp' },
  { label: 'TS%', k: 'ts' },
  { label: 'USG%', k: 'usg' },
  { label: 'PER', k: 'per' },
  { label: 'WS', k: 'ws' },
  { label: 'BPM', k: 'bpm' },
]

/**
 * Who he was that season, in one line: positions, height, team, games, minutes. Falls back to the
 * height alone when no stat line is on file. Exported because the man band prints the same season
 * and has to say the same things about it — one source, not two.
 */
export function seasonWho(p: Player) {
  const line = LINES[p.name] ?? null
  const ht = p.attrs.height ? `${Math.floor(p.attrs.height / 12)}'${p.attrs.height % 12}"` : null
  return line
    ? [line.pos?.join('/'), ht, line.teams?.join('/'), `${line.gp} G`, line.mpg !== undefined ? `${line.mpg} MPG` : null].filter(Boolean).join(' · ')
    : (ht ?? 'No stat line on file')
}

/**
 * The league's true shooting that season, recovered from the card. The efficiency RATING is
 * era-relative by doctrine, so a raw TS on its own reads wrong in a high-efficiency league:
 * ts_rel recentres ts_raw on .570, so league = ts_raw - ts_rel + .570.
 */
export function leagueTS(p: Player) {
  return p.attrs.ts_rel ? (p.attrs.ts_raw - p.attrs.ts_rel + 0.57).toFixed(3).replace(/^0/, '') : null
}

/**
 * THE DOOR TO THE MAN'S CARD, drawn as a person (his ruling: "Instead of the player page being
 * shown when pressing on the player's name, add a small human icon once you open the stats, that
 * will lead you there."). A head and a pair of shoulders, stroked in the weight the map and the
 * chevrons on this screen are stroked in — the app's own hand, never an emoji. The button is
 * 44px so a thumb can find it, and it names the man out loud for a screen reader.
 *
 * It stands beside the season line at the head of the panel (his ruling: "Move the human icon next
 * to 'season X'"). It used to sit in the box score's fifteenth cell — fourteen numbers in a
 * five-wide grid always leave the last one empty — which aligned it with the numbers but put the
 * way OUT of the panel at the very bottom of it, and left a man with no stat line on file needing
 * a fallback line of his own. At the head there is always a home for it and only one rule.
 */
export function CardDoor({ p, onOpen }: { p: Player; onOpen: () => void }) {
  return (
    <button
      className="pcard-door"
      aria-label={`Open ${p.name}'s player card`}
      title={`${p.name} — player card`}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        onOpen()
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="7.6" r="3.7" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <path d="M4.6 20.4c0-3.9 3.3-6.6 7.4-6.6s7.4 2.7 7.4 6.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    </button>
  )
}

/**
 * The tap-open panel. `full` = season line + the 17 attributes by category +
 * the Advanced window; `stats` = the season line only (the draft scouts on
 * what a player actually did, not on his ratings).
 *
 * `onCard` hangs the person icon above in the panel — the ONLY way into the man's card on a
 * screen whose rows have given up their name-as-a-door (his ruling, above). A panel without it
 * is unchanged.
 */
export function DetailGrid({ p, mode = 'full', onCard }: { p: Player; mode?: 'full' | 'stats'; onCard?: () => void }) {
  const inferred = !p.attrs.rim_mid_measured
  const line = LINES[p.name] ?? null
  const [adv, setAdv] = useState(false)
  const lgTS = leagueTS(p)
  const who = seasonWho(p)
  return (
    <span className="pdetail">
      <span className="dhead">
        {/* HIS RULING, 2026-09-09: "Move the human icon next to 'season X'." It stood in the box
            score's fifteenth cell, aligned with the numbers; beside the season line it is the
            first thing in the panel instead of the last, which is where a door belongs. */}
        <span className="dwho">
          <span className="dtier">Season {p.peak_season}</span>
          {onCard ? <CardDoor p={p} onOpen={onCard} /> : null}
        </span>
        <span className="dline">{who}</span>
      </span>
      {line ? (
        <span className="bgrid">
          {BOX.map((b) => (
            <span className="bcell" key={b.label}>
              <i>{b.label}</i>
              <b>{line[b.k] === undefined ? '—' : String(line[b.k])}</b>
              {b.k === 'ts' && lgTS ? <span className="bvs">vs league {lgTS}</span> : null}
            </span>
          ))}
        </span>
      ) : null}
      {mode === 'stats' ? null : (
        <>
      <span className="dhex">
        <HeatHex men={[p]} size={124} />
      </span>
      {inferred ? <span className="dnote">* rim/mid inferred (pre-1997)</span> : null}
      <span className="dnote">
        Ratings below are a season blend — 60% {p.peak_season}, 20% each side. The box line above is the real season,
        never blended. Advanced shows the exact weights.
      </span>
      {GROUPS.map((g) => (
        <span className="dcat" key={g.title}>
          <span className="section-rule">
            <span>{g.title}</span>
            <i />
          </span>
          <span className="dgrid">
            {g.keys.map((r) => {
              const v = p.attrs[r.k]
              return (
                <span className="dcell" key={r.k}>
                  <i>
                    {r.label}
                    {r.mark && inferred ? '*' : ''}
                  </i>
                  <b>{v}</b>
                  <span className="statt">
                    <span className="statf" style={{ width: pct(v) }} />
                  </span>
                </span>
              )
            })}
          </span>
        </span>
      ))}
      <button
        className="adv-open"
        onClick={(e) => {
          e.stopPropagation()
          setAdv(true)
        }}
      >
        Advanced — how every number is made →
      </button>
      {adv ? <Advanced p={p} onClose={() => setAdv(false)} /> : null}
        </>
      )}
    </span>
  )
}
