import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { archetype } from '../engine/pool'
import type { Player } from '../engine/types'
import { Advanced } from './Advanced'
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
      {p ? <CardSheet p={p} onClose={() => setP(null)} /> : null}
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

export function CardSheet({ p, onClose }: { p: Player; onClose: () => void }) {
  const [adv, setAdv] = useState(false)
  // USER MODE: the card is the man and his real season line — no verdict rail, no attribute
  // sheet, no Advanced. The engine keeps every number; the card just stops showing its hand.
  const user = useUserMode()
  const line = LINES[p.name] ?? null
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
        <div className="pc-tag">{archetype(p)}</div>
      </div>

      <div className="pc-body">
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
          <HeatHex men={[p]} size={118} />
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
