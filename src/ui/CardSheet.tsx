import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { archetype, PLAYERS } from '../engine/pool'
import type { Player } from '../engine/types'
import { Advanced } from './Advanced'
import { RULE } from './Archetypes'
import { SeasonStrip, useYearKeys } from './SeasonStrip'
import { HeatHex } from './HeatHex'
import { useUserMode } from '../state/viewmode'
import { GROUPS, LINES, pct } from './Stat'

/**
 * THE PLAYER CARD. Press a man's name anywhere in the app and his whole card loads.
 *
 * ONE SCREEN, NO SCROLLING (his ruling). The verdict — OVR / OFF / DEF — is a RAIL down the side,
 * because it is the summary and you read it at a glance; the season he actually played and the 16
 * attributes fill the middle, because that is the part you study. The four Lineup axes are gone: IN,
 * OUT, ID and PD are derived from the attributes printed right there, so they were the same numbers
 * twice.
 *
 * Wiring is a context so a row does not have to own modal state. Any component under the provider
 * renders <CardName p={p} /> and pressing it opens the card — the press is stopped at the name, so a
 * draft row still drafts when you tap the row itself.
 */

const Ctx = createContext<(p: Player) => void>(() => {})

/** Open the card for a player from anywhere under the provider. */
export const useCard = () => useContext(Ctx)

export function CardProvider({ children }: { children: React.ReactNode }) {
  const [p, setP] = useState<Player | null>(null)
  const open = useCallback((x: Player) => setP(x), [])
  const value = useMemo(() => open, [open])
  return (
    <Ctx.Provider value={value}>
      {children}
      {/* keyed on the card that was OPENED: the sheet carries its own season state, and opening
          a different man (or a different season of him from a row) must start that state over. */}
      {p ? <CardSheet key={p.name} p={p} onClose={() => setP(null)} /> : null}
    </Ctx.Provider>
  )
}

/**
 * A player's name, pressable. Looks like the name it replaces — the affordance is the press, not a
 * decoration — and it never bubbles, so it cannot draft, pick or select the row underneath it.
 */
export function CardName({ p, as = 'b' }: { p: Player; as?: 'b' | 'span' }) {
  const open = useCard()
  const Tag = as
  return (
    <Tag
      className="cardname"
      role="button"
      tabIndex={0}
      aria-label={`${p.name} card`}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        open(p)
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation()
          e.preventDefault()
          open(p)
        }
      }}
    >
      {p.name}
    </Tag>
  )
}

/** The season line, in the order a box score is read. */
const BOX = [
  ['PTS', 'ppg'],
  ['REB', 'rpg'],
  ['AST', 'apg'],
  ['STL', 'spg'],
  ['BLK', 'bpg'],
  ['TOV', 'topg'],
  ['FG%', 'fgp'],
  ['3P%', 'tpp'],
  ['FT%', 'ftp'],
  ['TS%', 'ts'],
  ['USG%', 'usg'],
  ['PER', 'per'],
  ['WS', 'ws'],
  ['BPM', 'bpm'],
] as const

/**
 * Every card of one man, oldest season first — the spine of the season strip.
 *
 * The pool is one row per player-SEASON ("Marcus Smart '19", "'20", "'22"), `player` is the man.
 * Built once, on the first card opened, and never rebuilt: 10,000 rows is a few milliseconds and
 * it must not cost anything at import time.
 */
let INDEX: Map<string, Player[]> | null = null
export function careerOf(p: Player): Player[] {
  if (!INDEX) {
    INDEX = new Map()
    for (const x of PLAYERS) {
      const a = INDEX.get(x.player)
      if (a) a.push(x)
      else INDEX.set(x.player, [x])
    }
    for (const a of INDEX.values()) a.sort((x, y) => x.peak_season - y.peak_season)
  }
  const all = INDEX.get(p.player)
  // a card the pool does not hold (and a man with one season) has nothing to step between
  if (!all || all.length < 2 || !all.some((x) => x.name === p.name)) return []
  return all
}

/** The season the draft uses: the man's highest OVR — the last of them when a band of years ties. */
export const peakOf = (all: Player[]) => all.reduce((best, x) => (x.ovr >= best.ovr ? x : best), all[0])

/**
 * HIS RULING: "In the player page add option to navigate between years".
 *
 * The man's seasons as mono chips under the name — the open one lit, ‹ › at the ends — in the same
 * chip language as the sort rail and the tactics row, and in the same self-scrolling row (LeBron is
 * 23 chips and the card must never scroll sideways). The chip the draft uses is marked PEAK.
 *
 * The strip itself now lives in ./SeasonStrip, because his later ruling put the same one on the
 * team page; this card only says which years there are and which is the peak.
 */
export function CardSheet({ p: opened, onClose }: { p: Player; onClose: () => void }) {
  const [adv, setAdv] = useState(false)
  // The season being READ. It starts at the card that was opened and never leaves the man; the
  // whole sheet below — name, season line, badge, sentence, boxes, radar, stats, bars, Advanced —
  // is drawn from it, so a year step re-renders this same sheet and nothing re-opens.
  const [season, setSeason] = useState(opened)
  const all = useMemo(() => careerOf(opened), [opened])
  const p = season
  const years = useMemo(() => {
    const peak = all.length ? peakOf(all) : null
    return all.map((x) => ({ id: x.name, y: x.peak_season, mark: x.name === peak?.name }))
  }, [all])

  useYearKeys(all.length > 1, (d) =>
    setSeason((cur) => {
      const at = all.findIndex((x) => x.name === cur.name) + d
      return at < 0 || at >= all.length ? cur : all[at]
    }),
  )
  // USER MODE: the card is the man and his real season line — no verdict rail, no attribute
  // sheet, no Advanced. The engine keeps every number; the card just stops showing its hand.
  const user = useUserMode()
  const line = LINES[p.name] ?? null
  const tag = archetype(p)
  const inferred = !p.attrs.rim_mid_measured
  const ht = p.attrs.height ? `${Math.floor(p.attrs.height / 12)}'${p.attrs.height % 12}"` : null
  const who = [line?.pos?.join('/'), ht, line?.team, line?.gp ? `${line.gp} G` : null, line?.mpg !== undefined ? `${line.mpg} MPG` : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="sheet sheetcard" onClick={(e) => e.stopPropagation()}>
      <div className="topbar pc-bar">
        <span>Player card</span>
        <button onClick={onClose}>← Back</button>
      </div>
      <div className="pc-head">
        <div className="pc-name">{p.name}</div>
        <div className="pc-sub">
          Season {p.peak_season} · {who || 'no stat line on file'}
        </div>
        <div className="pc-tag">{tag}</div>
        {/* HIS RULING: "Add the archetype description here". The badge named the tag and stopped;
            the draft's archetype card has always printed the sentence under it, so the card says
            it too — the same sentence, read from the one table that holds it. A man the tree
            cannot name shows the badge alone, not a placeholder. */}
        {RULE[tag] ? <p className="pc-what">{RULE[tag]}</p> : null}
        {all.length > 1 ? <SeasonStrip years={years} cur={p.name} go={(id) => setSeason(all.find((x) => x.name === id) ?? p)} /> : null}
      </div>

      {/* User mode drops the rail, so the body must stop reserving its column —
          otherwise the stat grid is squeezed into 100px and the line runs together. */}
      <div className={`pc-body${user ? ' solo' : ''}`}>
        {/* the verdict, down the side */}
        {user ? null : (
        <div className="pc-rail">
          {(
            [
              ['OVR', p.ovr],
              ['OFF', p.o_ovr],
              ['DEF', p.d_ovr],
            ] as const
          ).map(([l, v]) => (
            <div className={`pc-big ${l === 'OVR' ? 'lead' : ''}`} key={l}>
              <i>{l}</i>
              <b>{v}</b>
            </div>
          ))}
          <button className="pc-adv" onClick={() => setAdv(true)}>
            Advanced →
          </button>
          <HeatHex men={[p]} size={100} />
        </div>
        )}

        {/* the stats and the attributes, in the middle */}
        <div className="pc-main">
          {line ? (
            <>
              <div className="pc-rule">
                <span>Season {p.peak_season} — the real line, never blended</span>
                <i />
              </div>
              <div className="pc-stats">
                {BOX.map(([label, k]) => (
                  <span className="pc-cell" key={label}>
                    <i>{label}</i>
                    <b>{line[k] === undefined ? '—' : String(line[k])}</b>
                  </span>
                ))}
              </div>
            </>
          ) : null}

          {user ? null : (
          <>
          <div className="pc-rule">
            <span>Attributes — a season blend, 60% {p.peak_season} and 20% each side</span>
            <i />
          </div>
          <div className="pc-attrs">
            {GROUPS.map((g) => (
              <div className="pc-grp" key={g.title}>
                <div className="pc-grpname">{g.title}</div>
                <div className="pc-gcells">
                  {g.keys.map((r) => {
                    const v = p.attrs[r.k]
                    return (
                      <span className="pc-cell attr" key={r.k}>
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
                </div>
              </div>
            ))}
          </div>
          {inferred ? <div className="pc-note">* rim/mid inferred (pre-1997)</div> : null}
          </>
          )}
        </div>
      </div>

      <div className="pc-foot">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      {adv ? <Advanced p={p} onClose={() => setAdv(false)} /> : null}
    </div>
  )
}
