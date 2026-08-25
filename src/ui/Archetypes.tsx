import { useEffect, useMemo, useRef, useState } from 'react'
import { archetype, BIG_RULE, DEFAULT_ORDER, isDefaultOrder, isSavedOrder, PLAYERS, ruleText, savedTagOrder, setTagOrder, tagOrder } from '../engine/pool'
import type { Player } from '../engine/types'
import { PlayerDials } from './MatchupPanel'
import { DetailGrid } from './Stat'

/**
 * The archetype database: every tag the tree hands out, what it means, and every
 * player-season wearing it. The tree is 45 rules read top-down, first match wins,
 * so a man holds exactly one tag — which makes this a partition of the whole
 * database, not a set of overlapping filters. Tags describe STYLE, never tier;
 * quality is OVR's job, and the OVR spread inside a tag shows it.
 */
const RULE: Record<string, string> = {
  'Defensive playmaker': 'Passing volume with real perimeter defense, and no scoring zone above 55.',
  'Point god': 'Assist volume at the very top, 6′6″ or under, and not a big.',
  'Offensive engine': 'Assist volume and shot volume both at the ceiling — the offense runs through him.',
  'Triple-double threat': 'Playmaking, rebounding and usage all high — any size. A centre who runs the offense qualifies.',
  'Versatile defender': 'Guards several spots: honest at the rim AND on the perimeter. Being elite at one of them does not disqualify him.',
  'Point forward': 'A creator in a forward’s body — 6′7″ to 6′10″ — with real assist volume.',
  'Floor general': 'Assist volume high, usage kept under 88 — he sets the table, he does not eat it.',
  'Floor raiser': 'Enormous playmaking at real load on poor efficiency: the only creation his team has, and he has to force it.',
  'Two-way anchor': 'A big who protects the rim at 90+ and scores at 78+.',
  Unicorn: 'A 7\'2\" big who protects the rim at 85+, shoots from three, and is a real player (OVR 70+).',
  'Two-way star': 'Both ends above 85. There are not many.',
  'All-around star': 'Eighty at both ends. Not elite at either — that is the two-way star above him — but there is no half of the floor he does not hold up.',
  'Offensive superstar': 'Eighty-five and up on offense with a defense under 70. He wins you games at one end and gives some of it back at the other — the trade every contender argues about.',
  'Elite defender': 'Ninety and up on defense with an offense under 80. The mirror of the offensive superstar: you play him for what he stops, and you live with the rest.',
  'Two-way wing': 'A perimeter player at 78 offense and 85 defense.',
  'Volume shooter': 'He takes everything and converts little — volume over 90 on an efficiency under 75, and he is not the one setting the table: playmaking volume under 60. Somebody has to shoot, and on his team it is him.',
  'Scoring machine': 'Enormous load and an elite first zone, at an efficiency that is merely respectable (his ruling: the floor is 50, not 65). A man who scores 28 a night on volume shooting is a scoring machine — demanding elite conversion as well described a different, rarer player.',
  Scorer: 'His defining trait is putting it in the basket, and no single diet above described him. Not a creator: the offense does not run through him.',
  'Three-level scorer': 'Real usage, high efficiency, and three REAL levels — paint and mid at 65+, three at 55+. Nowhere to hide him.',
  'Midrange maestro': 'Mid at 85+ with no three-point game, at high usage.',
  Slasher: 'A perimeter player who lives at the rim and draws fouls, without a three.',
  'Paint beast': 'Paint 95+ at high usage with no three at all. The rim is the whole plan, and it works.',
  'Freight train': 'Rim 85+ on a real load, no three, no midrange, and a small forward or 6′8″ and under. He goes through you.',
  Tank: 'A big who scores inside and draws fouls but cannot make the free throws.',
  'Free throw merchant': 'Draws fouls at 90+ and makes them pay at 80+.',
  'Spark plug': 'Under 6′3″, using 80+ of the possessions he is on the floor for, without being a star (OFF under 85).',
  Flamethrower: 'Three-point rating 90+ at real usage.',
  Sniper: 'Three-point rating 90+ at low usage — he does one thing perfectly.',
  Deadeye: 'A pure stroke on a small load — 80+ from three, 80+ from the line, under 50 volume. He is not asked to create the shot, only to make it.',
  'Catch-and-shoot wing': 'A WING who shoots at 80+ — 6′5″ to 6′10″ — creating nothing and using nothing.',
  'Stretch big': 'A big of 6\'10\" or more who shoots the three at 70+. A wing who shoots is just a wing.',
  'All-around big': 'Six-eleven and up, scoring at the rim, carrying a jumper, and cleaning the defensive glass. The complete big — no half of the frontcourt job he cannot do.',
  'Glass cleaner': 'Both rebounding rates at 90+.',
  'Energy big': 'Offensive rebounding at 85+ on low usage.',
  Enforcer: 'A rim protector who fouls — discipline under 35.',
  Anchor: 'Rim protection at 90+ on low usage. He is there to defend.',
  '3&D': 'Shoots at 75+, defends at 70+, uses nothing. The shape every contender buys by the dozen.',
  'Elite role player': 'Low load, no creation, and genuinely good at BOTH ends — OFF and DEF both over 60 on volume and playvol under 60. The fifth starter every contender wants: he asks for nothing and gives you two-way minutes.',
  Stopper: 'Perimeter defense at 90+, low usage, offense under 80 — and no three-point shot, or he is an elite role player instead.',
  Pest: 'Under 6′4″ with disruption at 90+.',
  'Combo guard': 'Six foot to six-six, creating at a second handler’s rate and scoring on a real but not leading load. He does some of both and neither at a star’s rate — the guard every rotation has and no single diet describes.',
  Throwback: 'Midrange at 75+ with essentially no three-point shot.',
  'Post scorer': 'Scores inside and from mid, no three, no playmaking.',
  'Glue guy': 'Four of the five glue dimensions — best scoring zone, playmaking volume, his better defensive number, his better rebounding number, ball security — between 55 and 75, with nothing at 80 and enough playmaking volume (40) to be a real rotation piece. Above average at four things and elite at none: the shape BALANCED was hiding, because every rule above this one names a strength and he does not have one.',
  'All-around': 'Solid on at least three of four dimensions with no single rating above 88 — good at everything, remarkable at nothing.',
  Balanced: 'Matched no rule in the tree: nothing about the sheet is distinctive enough to name. Only for OVR 79 and below — for a role player that is simply the truth.',
  Unclassified: 'OVR 80 and up, and no rule in the tree matched his sheet at its own thresholds. He is NOT softened into the nearest fit — the tree says plainly that it has no name for him. Each one is a missing rule or a threshold set a few points too high; `npm run unfit` prints the list with the rule each man came closest to.',
}

const ROW_H = 62
const OVERSCAN = 10
const short = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '')

export function Archetypes({ onBack }: { onBack: () => void }) {
  const [tag, setTag] = useState<string | null>(null)
  /** The ranking screen: the tree's order, editable. `bump` forces the lists to re-tag after a move. */
  const [ranking, setRanking] = useState(false)
  const [order, setOrder] = useState<string[]>(() => tagOrder())
  const [bump, setBump] = useState(0)
  /**
   * A move is a DRAFT: applied to the live tree so the counts below are the truth for this order, but
   * not written down. `dirty` is the difference between what you are looking at and what is saved.
   */
  const [dirty, setDirty] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const draft = (next: string[] | null) => {
    setTagOrder(next, false)
    setOrder(next ? [...next] : [...DEFAULT_ORDER])
    setDirty(!isSavedOrder())
    setJustSaved(false)
    setBump((b) => b + 1)
  }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    draft(next)
  }
  /** Back to the shipped law — still a draft, so it too has to be saved. */
  const resetOrder = () => draft(null)
  /** Throw the draft away and put the saved ranking back on the tree. */
  const discard = () => {
    const back = savedTagOrder()
    setTagOrder(back.every((t, i) => t === DEFAULT_ORDER[i]) ? null : back, false)
    setOrder([...back])
    setDirty(false)
    setJustSaved(false)
    setBump((b) => b + 1)
  }
  const save = () => {
    setTagOrder(isDefaultOrder() ? null : order)
    setDirty(false)
    setJustSaved(true)
    setBump((b) => b + 1)
  }
  /** Leaving the screen is not a save, so an unsaved draft asks before it is dropped. */
  const leaveRanking = () => {
    if (dirty && !window.confirm('Leave without saving? Your ranking goes back to the saved order.')) return
    if (dirty) discard()
    setRanking(false)
  }
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [scroll, setScroll] = useState(0)
  const [viewH, setViewH] = useState(800)
  const sheet = useRef<HTMLDivElement>(null)

  /** One pass over the pool: every season sorted into its tag, best first. */
  const groups = useMemo(() => {
    const m = new Map<string, Player[]>()
    for (const p of PLAYERS) {
      const t = archetype(p)
      const list = m.get(t)
      if (list) list.push(p)
      else m.set(t, [p])
    }
    for (const list of m.values()) list.sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name))
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump])

  const rows = useMemo(() => {
    if (!tag) return []
    const list = groups.find(([t]) => t === tag)?.[1] ?? []
    const needle = q.trim().toLowerCase()
    return needle ? list.filter((p) => p.name.toLowerCase().includes(needle)) : list
  }, [tag, q, groups])

  useEffect(() => {
    const el = sheet.current
    if (!el) return
    const onScroll = () => setScroll(el.scrollTop)
    const onSize = () => setViewH(el.clientHeight)
    onSize()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onSize)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onSize)
    }
  }, [tag])

  const first = Math.max(0, Math.floor(scroll / ROW_H) - OVERSCAN)
  const count = Math.ceil(viewH / ROW_H) + OVERSCAN * 2
  const slice = rows.slice(first, first + count)

  // ---- the ranking screen: priority order, because first match wins ----
  if (ranking) {
    const counts = new Map(groups)
    return (
      <div className="sheet" ref={sheet}>
        <div className="topbar">
          <span>
            Rank the tree · <b>{order.length}</b> tags
          </span>
          <button onClick={leaveRanking}>← Tags</button>
        </div>
        <div className="rule2" />
        <div className="lede">
          The tree is read top to bottom and the first rule that matches wins, so this order IS the law: a tag above another
          claims the players they both describe. Move Versatile defender above Enforcer and versatile bigs stop reading as
          enforcers. Balanced is not listed — it is the fallback, and always last.
        </div>
        <div className="map-head">
          <div className="map-kicker">
            {isDefaultOrder() ? 'Shipped order' : 'Your order'}
            {dirty ? <b className="rank-dirty"> · unsaved</b> : justSaved ? <b className="rank-saved"> · saved</b> : null}
          </div>
          {isDefaultOrder() ? null : (
            <button className="map-link danger" onClick={resetOrder}>
              Reset to the shipped order
            </button>
          )}
        </div>
        <div className="rank-note">
          Moves apply straight away so you can see what they do — the counts below are real. They are not written down
          until you save.
        </div>
        <div className="ranklist-tags">
          {order.map((t, i) => (
            <div className="rankrow" key={t}>
              <span className="rankn">{i + 1}</span>
              <span className="rankname">
                <b>{t}</b>
                <i>{(counts.get(t) ?? []).length.toLocaleString()} seasons</i>
                <code className="arch-cond">{ruleText(t)}</code>
              </span>
              <span className="rankbtns">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${t} up`}>
                  ↑
                </button>
                <button onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${t} down`}>
                  ↓
                </button>
              </span>
            </div>
          ))}
        </div>
        <div className="dock">
          <div className="dock-inner two">
            <button className="btn ghost" onClick={discard} disabled={!dirty}>
              Discard
            </button>
            <button className="btn" onClick={save} disabled={!dirty}>
              {dirty ? 'Save ranking' : justSaved ? 'Saved ✓' : 'Saved'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- the index: every tag, its share of the database, its OVR range ----
  if (!tag)
    return (
      <div className="sheet" ref={sheet}>
        <div className="topbar">
          <span>
            Archetypes · <b>{groups.length}</b> tags over {PLAYERS.length.toLocaleString()} seasons
          </span>
          <span className="arch-head-btns">
            <button className="cmp-open" onClick={() => setRanking(true)}>
              Rank ↕
            </button>
            <button onClick={onBack}>← Back</button>
          </span>
        </div>
        <div className="rule2" />
        <div className="lede">
          Every season in the database wears exactly one tag: the tree is read top-down and the first rule that matches wins. Tags name a STYLE, never a
          tier — the OVR range inside each one shows how little the name says about quality.
        </div>
        <div className="arch-legend">
          Every condition below is the arithmetic the labeler actually ran, printed from the rule itself. <b>zone</b> = the
          best of 3pt/rim/mid · <b>h</b> = height in inches · <b>solid</b> = how many of zone, playvol, best defence and
          best rebounding clear 60 · <b>big</b> = {BIG_RULE}
        </div>
        <div className="arch-grid">
          {groups.map(([t, list]) => {
            const top = list[0]
            const lo = list[list.length - 1]
            return (
              <button key={t} className="arch-tile" onClick={() => (setTag(t), setQ(''), setScroll(0))}>
                <div className="arch-head">
                  <b>{t}</b>
                  <span className="arch-n">{list.length.toLocaleString()}</span>
                </div>
                <i className="arch-rule">{RULE[t] ?? 'A tag from the tree.'}</i>
                <code className="arch-cond">{ruleText(t)}</code>
                <div className="arch-foot">
                  <span>
                    OVR {lo.ovr}–{top.ovr}
                  </span>
                  <span className="arch-top">{short(top.name)}</span>
                  <span className="arch-pct">{((100 * list.length) / PLAYERS.length).toFixed(1)}%</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )

  // ---- one tag: every man who wears it ----
  return (
    <div className="sheet" ref={sheet}>
      <div className="topbar">
        <span>
          {tag} · <b>{rows.length.toLocaleString()}</b>
          {q ? ' found' : ' seasons'}
        </span>
        <button onClick={() => (setTag(null), setOpen(null), setScroll(0))}>← Tags</button>
      </div>
      <div className="rule2" />
      <div className="lede tight">{RULE[tag] ?? 'A tag from the tree.'}</div>
      <div className="arch-cond-big">
        <span className="arch-cond-lab">the rule</span>
        <code>{ruleText(tag)}</code>
      </div>

      <label className="search">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" stroke="#6E6656" strokeWidth="1.5" />
          <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="#6E6656" strokeWidth="1.5" />
        </svg>
        <input
          type="search"
          placeholder={`Search in ${tag}…`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            if (sheet.current) sheet.current.scrollTop = 0
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="pool" style={{ marginTop: 10 }}>
        <div className="rowhead db" style={{ marginTop: 0 }}>
          <span>Player</span>
          <span className="gcap dialhead">
            <i>OVR</i>
            <i>OFF</i>
            <i>DEF</i>
          </span>
        </div>
        <div style={{ height: first * ROW_H }} />
        {slice.map((p) => (
          <div key={p.name} style={{ display: 'contents' }}>
            <div
              className={`row db ${open === p.name ? 'exp' : ''}`}
              role="button"
              tabIndex={0}
              aria-expanded={open === p.name}
              onClick={() => setOpen(open === p.name ? null : p.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpen(open === p.name ? null : p.name)
                }
              }}
            >
              <span className="pname">
                <span className="who">
                  <b>{p.name}</b>
                  <i>{p.peak_season}</i>
                </span>
              </span>
              <PlayerDials p={p} />
            </div>
            {open === p.name ? <DetailGrid p={p} /> : null}
          </div>
        ))}
        <div style={{ height: Math.max(0, (rows.length - first - slice.length) * ROW_H) }} />
      </div>
    </div>
  )
}
