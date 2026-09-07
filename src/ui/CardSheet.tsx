import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { archetype, PLAYERS } from '../engine/pool'
import type { Player } from '../engine/types'
import { Advanced } from './Advanced'
import { RULE } from './Archetypes'
import { SeasonStrip, useYearKeys } from './SeasonStrip'
import { HeatHex } from './HeatHex'
import { useUserMode } from '../state/viewmode'
import { GROUPS, LINES, pct } from './Stat'
import { teamColor, terminalSkin } from './teamColors'

/**
 * THE PLAYER CARD. Press a man's name anywhere in the app and his whole card loads.
 *
 * IT IS A TERMINAL, AND IT IS LIT IN HIS CLUB (Claude Design direction 1b, his ruling: "Use 1b,
 * but for each player his team colors"). A status line across the top, a status line across the
 * bottom, hairline boxes between them, and the whole thing set in one monospace so the columns
 * line up the way a readout's columns do. The colour is not the app's gold-on-black: it is the
 * club the man played for that SEASON — Milwaukee's green, Utah's navy, the Lakers' purple and
 * gold — built by `terminalSkin` and hung on the card as the app's own token names, so the season
 * strip, the heat hexagon and the CLOSE button re-light without knowing anything about clubs.
 * Step a year and a man who was traded changes club mid-card, because that is what he did.
 *
 * ONE SCREEN, NO SCROLLING (his ruling). 1b drew a 1180px desk with a season column down the left;
 * this is a phone first, so the seasons keep the strip that already solves LeBron's 23 of them by
 * scrolling inside itself, and the desk gets 1b's shape from two grid areas instead — the readouts
 * and the sheet on the left, the dossier and the hex down the right. The four Lineup axes are gone:
 * IN, OUT, ID and PD are derived from the attributes printed right there, so they were the same
 * numbers twice.
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
  // USER MODE: the card is the man and his real season line — no verdict, no attribute sheet, no
  // Advanced. The engine keeps every number; the card just stops showing its hand. The terminal
  // itself stays: it is how a card looks now, in both modes, and the club lights it either way.
  const user = useUserMode()
  const line = LINES[p.name] ?? null
  const tag = archetype(p)
  const inferred = !p.attrs.rim_mid_measured
  const ht = p.attrs.height ? `${Math.floor(p.attrs.height / 12)}'${p.attrs.height % 12}"` : null

  /*
   * THE CLUB HE PLAYED FOR THAT SEASON — the whole card's colour, read off the stat line and not
   * off the man, so stepping a year moves a traded man's terminal from one club to the other.
   * `MULTI` is the pool's own mark for a season split between clubs: he wore two that year and the
   * card will not pick one for him, so it falls through to the table's fallback and the terminal
   * reads in the app's steel — an answer, not a gap.
   */
  const ab = line?.team
  const skin = useMemo(() => terminalSkin(teamColor(ab)), [ab])

  const peak = all.length ? peakOf(all) : null
  // A man the pool holds one season of has no strip to step and no peak to compare against — that
  // one season IS his peak, so the card says so rather than calling it merely "selected".
  const isPeak = all.length ? peak?.name === p.name : true
  const yy = (y: number) => `’${String(y).slice(2)}`
  const span = all.length > 1 ? `${yy(all[0].peak_season)}–${yy(all[all.length - 1].peak_season)}` : null

  // The dossier's ledger — the run-on "PG/SG · 6'11\" · MIL · 63 G" line broken into the readout
  // rows 1b prints, label dim on the left and the value bright on the right. A row with nothing
  // behind it is dropped rather than dashed: the terminal never prints an empty field.
  const META = (
    [
      ['SEASON', `${p.peak_season}${isPeak ? ' ◄PEAK' : ''}`],
      ['POS', line?.pos?.length ? line.pos.join('·') : null],
      ['HT', ht],
      ['TEAM', line?.team ?? null],
      ['GP', line?.gp !== undefined ? String(line.gp) : null],
      ['MPG', line?.mpg !== undefined ? String(line.mpg) : null],
    ] as [string, string | null][]
  ).filter((r): r is [string, string] => !!r[1])

  return (
    // The skin is the app's own token names restated in the club's hue (see terminalSkin), so
    // everything under here — the strip, the hex, the button — re-lights without being told.
    <div className="sheet sheetcard pc-term" style={skin as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
      {/* the top status line. The middle slot carries the club and the season because those two
          are what the card is coloured BY; on a phone the leftmost slot stands down. */}
      <div className="pct-bar">
        <span className="pct-sys">GAME7.SYS &#9656; PLAYER CARD</span>
        <span className="pct-slug">
          {ab ?? '—'} // S{p.peak_season}
        </span>
        <button className="pct-esc" onClick={onClose}>
          [ESC] CLOSE
        </button>
      </div>

      <div className="pc-body">
        {/* WHO HE IS — the head of the card on a phone, the right-hand dossier on a desk */}
        <div className="pct-id">
          <div className="pc-name">{p.player}</div>
          <div className="pc-tag">{tag}</div>
          <div className="pct-meta">
            {META.map(([k, v]) => (
              <div className="pct-mrow" key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
          {/* HIS RULING: "Add the archetype description here" — the same sentence the draft's
              archetype card prints, in the terminal's comment voice. */}
          {RULE[tag] ? <p className="pc-what">// {RULE[tag]}</p> : null}
        </div>

        {all.length > 1 ? (
          <div className="pct-years">
            <div className="pc-rule">
              <span>SEASONS &#9656; {span} ON FILE</span>
              <i />
            </div>
            <SeasonStrip years={years} cur={p.name} go={(id) => setSeason(all.find((x) => x.name === id) ?? p)} />
          </div>
        ) : null}

        {/* the verdict, the season line and the sheet */}
        <div className="pc-main">
          {user ? null : (
            <div className="pct-readouts">
              {(
                [
                  ['OVR', 'OVERALL', p.ovr],
                  ['OFF', 'OFFENSE', p.o_ovr],
                  ['DEF', 'DEFENSE', p.d_ovr],
                ] as const
              ).map(([l, word, v]) => (
                <div className={`pc-big ${l === 'OVR' ? 'lead' : ''}`} key={l}>
                  <i>
                    {l} &#9656; {word}
                  </i>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          )}

          {line ? (
            <>
              <div className="pc-rule">
                <span>STATLINE.{p.peak_season} &#9656; THE REAL LINE, NEVER BLENDED</span>
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
                <span>ATTRIBUTES &#9656; BLEND 60% {p.peak_season} &#183; 20% EACH SIDE</span>
                <i />
              </div>
              {/* 1b's sheet is a ROW per attribute — name, track, number — under a ruled group
                  head, two columns of them. The track is the one thing a 375px phone cannot
                  spare, and it comes off there exactly as it did before. */}
              <div className="pc-attrs">
                {GROUPS.map((g) => (
                  <div className="pc-grp" key={g.title}>
                    <div className="pc-grpname">
                      <i />
                      <span>{g.title}</span>
                      <i />
                    </div>
                    {g.keys.map((r) => {
                      const v = p.attrs[r.k]
                      return (
                        <div className="pct-attr" key={r.k}>
                          <span className="k">
                            {r.label}
                            {r.mark && inferred ? '*' : ''}
                          </span>
                          <span className="statt">
                            <span className="statf" style={{ width: pct(v) }} />
                          </span>
                          <b>{v}</b>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              {inferred ? <div className="pc-note">// * RIM/MID INFERRED (PRE-1997)</div> : null}
            </>
          )}
        </div>

        {/* the shape, and the way down into the numbers behind it */}
        {user ? null : (
          <div className="pct-shape">
            <div className="pc-rule">
              <span>SHAPE.HEX &#9656; 6-AXIS</span>
              <i />
            </div>
            <div className="pct-hexbox">
              <HeatHex men={[p]} size={168} />
            </div>
            <button className="pc-adv" onClick={() => setAdv(true)}>
              ADVANCED &rarr;
            </button>
          </div>
        )}
      </div>

      {/* the bottom status line: which season is loaded, and how many there are to step between */}
      <div className="pct-status">
        <span>
          STATUS &#9656; <b>{isPeak ? 'PEAK LOCKED' : `S${p.peak_season} SELECTED`}</b>
        </span>
        <span>{span ? `${span} AVAILABLE █` : 'SINGLE SEASON █'}</span>
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
