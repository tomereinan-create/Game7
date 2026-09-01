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
  'Defensive playmaker': 'He runs the offense and takes the other team’s best perimeter man. Two demanding jobs at once, and the shot is somebody else’s.',
  'Point god': 'The finest passer in the game, in a guard’s body. Everything the offense does begins with him, and he would rather it ended with somebody else.',
  'Offensive engine': 'He passes at the ceiling and shoots at the ceiling. The offense does not run through him so much as it simply is him.',
  'Triple-double threat': 'He fills every column at once — creating, rebounding and scoring, all three at a high rate. The box score runs out of room before he does.',
  'Versatile defender': 'He guards several positions, honest on the perimeter and honest at the rim. Switch him onto anybody and the possession still gets defended.',
  'Point forward': 'A creator in a forward’s body. He brings it up and sets the table from a place the defense does not expect a passer to be.',
  'Floor general': 'A lead creator who sets the table — a guard, a wing or a seven-footer, the job is the same. He would rather make the pass than take the shot, and the offense is organised because he is out there.',
  'Floor raiser': 'He creates everything his team has, and it costs him — a heavy load, forced, and a lot of it misses. Take him off the floor and there is no offense at all.',
  'Two-way anchor': 'A true rim protector who is also a real offensive player. He guards the basket and he scores — the frontcourt job, both halves of it.',
  Unicorn: 'A seven-foot-two man who protects the rim and shoots from range. He defends the basket like a centre and spaces the floor like a wing.',
  'Two-way star': 'Elite at both ends. There are not many.',
  'Two-way guard': 'A guard who takes the other team’s best perimeter man, passes like a second handler, and scores well on top of it. All of that out of the smallest body on the floor.',
  'All-around star': 'A star who scores, passes and holds up defensively — the whole game at once, all of it played well. Whatever the game plan takes away, he has the rest.',
  'Offensive superstar': 'He wins you games at one end and gives some of it back at the other — the trade every contender argues about.',
  'Elite defender': 'A defense good enough to build a team around. You play him for what he stops, and the scoring is somebody else’s to supply.',
  'Two-way big': 'A big whose defense carries him, with an offense that is real and secondary. He holds the frontcourt down and gives you honest points on top of it.',
  'Two-way wing': 'A wing whose defense is the elite half and whose offense is genuinely good. The shape every playoff team goes shopping for.',
  'Volume shooter': 'He takes everything, and a lot of it misses. Somebody has to shoot, and on his team it is him.',
  'Scoring machine': 'He scores in enormous quantity from one elite spot, and somebody else creates it for him. Points are the contribution, and there are a great many of them.',
  Scorer: 'Putting it in the basket is the whole of the job. A guard or a wing with one place on the floor he is good from, and he goes there all night.',
  'Three-level scorer': 'He scores at the rim, from the midrange and from behind the arc, constantly and accurately. There is nowhere to hide him.',
  'Midrange maestro': 'He shoots a great deal, and his game lives in the country between the paint and the arc. He gets to his spot whenever he wants it, and shoots over you when he arrives.',
  Slasher: 'A perimeter player who lives at the rim and gets to the line. He beats you off the bounce, and everything he scores comes from inside the arc.',
  'Paint beast': 'A big who scores at the rim in enormous quantity and never steps away from it. The rim is the whole plan, and it works.',
  'Freight train': 'A forward who scores at the rim by being stronger than whoever is standing in it. Everything he has comes from inside, and he goes through you to get it.',
  Tank: 'A big who scores inside and gets fouled constantly, then misses the free throws. Putting him on the line is a real strategy.',
  'Free throw merchant': 'He draws fouls better than almost anyone and makes them pay from the line. Points with nobody allowed to contest them.',
  'Spark plug': 'A small guard who starts shooting the moment he touches the floor. Instant offense, for better and for worse.',
  Flamethrower: 'An elite shooter who fires early and often. The range is a threat before the ball ever reaches him.',
  Sniper: 'An elite shooter who takes almost nothing. He does one thing perfectly and asks for nothing else.',
  Deadeye: 'A pure stroke on a small load, from range and from the line. Somebody else creates the shot; his job starts when the ball reaches him.',
  'Catch-and-shoot wing': 'A wing who spaces the floor and shoots what he is given. The pass is all he needs.',
  'Stretch big': 'A big man who shoots from range. He pulls the biggest man guarding him away from the basket, and the paint opens up behind him.',
  'All-around big': 'The complete big man: he scores at the rim, carries a jumper, and cleans the defensive glass. The whole frontcourt job, in one man.',
  'Glass cleaner': 'He rebounds at an elite rate at both ends. The possession ends when he decides it ends.',
  'Energy big': 'A big who lives on the offensive glass and asks for no plays at all. Second chances are the entire contribution, and they are worth plenty.',
  Enforcer: 'A rim protector who fouls. He will defend the basket, and he will pick up his share on the way.',
  Anchor: 'Elite rim protection on a small offensive load. He is out there to defend the basket, and that is the job.',
  '3&D': 'He shoots, he guards the perimeter, and he does not ask for the ball. The shape every contender buys by the dozen.',
  'Elite role player': 'The fifth starter every contender wants. He shoots, he defends at a level the other team has to plan around, and he keeps the ball moving to the next man.',
  Stopper: 'He takes the other team’s best perimeter scorer and removes him from the game. Stopping is the whole contribution, and it is enough to keep him on the floor.',
  Pest: 'A little guard who is a menace on the ball. He picks pockets and lives in the passing lanes.',
  'Combo guard': 'A guard who does some creating and some scoring, and can be asked for either on a given night. Every rotation has one.',
  Throwback: 'A midrange game, and every shot he takes is a two. He would have been at home in an earlier decade.',
  'Post scorer': 'A big who scores with his back to the basket and from the elbow. The old frontcourt job done the old way: he gets it on the block, and it stays there until it goes in.',
  'Co-star': 'The second star: a real offensive player who holds up defensively. Somebody’s second-best player, and a good team needs one.',
  'Glue guy': 'He scores a little, passes a little, defends, rebounds and takes care of the ball — above average at all of it, on a light load. The team is better with him out there and the box score never quite says why.',
  'All-around': 'Solid at several parts of the game at once, and carrying a real share of the load while he does it. He gives you some of whatever the night is short of.',
  Balanced: 'The ordinary run of the league — a real player with a real job, whose mix of strengths never settles into a type. Most of every rotation is made of him.',
  Unclassified: 'A good player whose shape the tree has no name for yet. He is reported rather than fudged into the nearest fit — `npm run unfit` prints the list.',
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
  /** Leaving the screen is not a save, so an unsaved draft asks before it is dropped —
   * with a two-tap on the button itself (browser popups never render on his phone). */
  const [armLeave, setArmLeave] = useState(false)
  const leaveRanking = () => {
    if (dirty && !armLeave) {
      setArmLeave(true)
      window.setTimeout(() => setArmLeave(false), 4000)
      return
    }
    setArmLeave(false)
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

  // THE ONE VARIABLE-HEIGHT ROW. The open panel's height is measured off the DOM and folded into
  // the window math: scroll past the panel is shifted back by its height before slicing, and the
  // pad on whichever side holds the open row reserves it. Without this the slice lagged the real
  // offset, and when the open row left the slice its panel unmounted, the list shrank and the
  // browser clamped the scroll straight back up — the press-a-player-then-scroll jump.
  const expRef = useRef<HTMLDivElement>(null)
  const [expH, setExpH] = useState(0)
  useEffect(() => {
    if (open && expRef.current) setExpH(expRef.current.offsetHeight)
  }, [open])
  const openIdx = open ? rows.findIndex((p) => p.name === open) : -1
  const panelAt = openIdx >= 0 ? (openIdx + 1) * ROW_H : Infinity
  const eff = scroll > panelAt ? Math.max(panelAt, scroll - expH) : scroll
  const first = Math.max(0, Math.floor(eff / ROW_H) - OVERSCAN)
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
          <button onClick={leaveRanking}>{armLeave && dirty ? 'Drop the unsaved order? — tap again' : '← Tags'}</button>
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
        <div style={{ height: first * ROW_H + (openIdx >= 0 && openIdx < first ? expH : 0) }} />
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
            {open === p.name ? (
              <div ref={expRef}>
                <DetailGrid p={p} />
              </div>
            ) : null}
          </div>
        ))}
        <div style={{ height: Math.max(0, (rows.length - first - slice.length) * ROW_H) + (openIdx >= first + slice.length ? expH : 0) }} />
      </div>
    </div>
  )
}
