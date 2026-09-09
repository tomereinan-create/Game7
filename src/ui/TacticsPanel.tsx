import { ChipRow } from './ChipRow'
import type { Side } from './CourtFive'
import { useUserMode } from '../state/viewmode'
import { usageSurplus } from '../engine/offense'
import type { Player } from '../engine/types'
import {
  gateTactics,
  heliMan,
  pnrPair,
  popPair,
  postMan,
  postOption,
  triangleReaders,
  SCHEMES,
  schemeFit,
  styleFit,
  STYLES,
  tacticsParts,
  type Tactics,
} from '../engine/tactics'

/** The name a chip wears: the season tag off, and the surname alone. */
const shortName = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '').split(' ').slice(-1)[0]

/** What the plan is worth on this five, in points of spread. Null in user mode and at rank 0. */
export function tacticsWorth(tactics: Tactics, playbook: number, five: Player[], theirs?: Player[]): number | null {
  if (playbook <= 0) return null
  return tacticsParts(gateTactics(tactics, playbook), five, theirs).reduce((a, x) => a + x.pts, 0)
}
/** …said the way both card heads say it. */
export const worthLine = (w: number) => `worth ${w >= 0 ? '+' : '−'}${Math.abs(w).toFixed(1)} pts of spread`

/**
 * THE CALLS THEMSELVES — the rows of the plan, lifted out of My team so a second screen can hold
 * them (his report: "Tactics arent visable in boths campaigns(Salary and normal)").
 *
 * They moved here VERBATIM. Every ruling written into them is still written into them: helio
 * overtaking the two named men, the pick-and-roll's pair, the post target, the triangle's read,
 * the two halves of the glass, and the side toggle governing which of them is on show. This file
 * owns none of that; it is the same panel with two addresses.
 *
 * `theirs` is the one thing the two screens do not share. My team is on the map and does not know
 * who is next, so it prices the scheme and the hunt on the five alone and says so; the draft is
 * standing across from a named opponent, so it passes him and every fit on the panel is the same
 * number the odds card below it uses. The parameter has always existed on the engine's own fits —
 * nothing about a price changed here, only whether the screen has the argument to give.
 */
export function TacticsCalls({
  tactics,
  playbook,
  five,
  theirs,
  side,
  onTactics,
}: {
  tactics: Tactics
  /** The Playbook node's rank: 0 none, 1 the men and the tempo, 2 the diet and the glass, 3 all of it. */
  playbook: number
  five: Player[]
  /** The opponent, where the screen knows him. Omitted, the fits read the five alone, as My team's do. */
  theirs?: Player[]
  side: Side
  onTactics: (t: Tactics) => void
}) {
  const user = useUserMode()
  /** What each side actually has to offer at this Playbook rank. */
  const sideHas = { off: playbook >= 1, def: playbook >= 2 }
  return (
    <>
      {/* his ruling: the court's toggle governs the whole screen, so the panel shows one
          side at a time. The group headings are gone with it — a rule reading OFFENSE
          directly under a lit OFFENSE chip said the same thing twice and cost a row. */}
      {/* HIS RULING: "Helio will overtake main playmaker and scorrer, as helio becomes both".
          While helio is called, the creator holds both jobs, so the two rows stop taking a
          call: they grey out and say who has it instead. The saved names are untouched
          underneath and come back the moment the style changes. */}
      {side === 'off' && playbook >= 1
        ? (
            [
              ['Main scorer', 'scorer'],
              ['Main playmaker', 'playmaker'],
            ] as const
          ).map(([label, key]) => {
            const heliMans = tactics.style === 'helio' && playbook >= 2 ? heliMan(five, tactics.helio).creator : null
            return (
              <div className={`posbar ${heliMans ? 'superseded' : ''}`} key={key}>
                <span className="cap">{label}</span>
                {heliMans ? (
                  <span className="tnote">helio · {shortName(heliMans.name)} runs everything</span>
                ) : (
                  <ChipRow>
                    <button className={`sortb ${tactics[key] === null ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, [key]: null })}>
                      —
                    </button>
                    {five.map((p) => (
                      <button
                        key={p.name}
                        className={`sortb ${tactics[key] === p.name ? 'on' : ''}`}
                        onClick={() => onTactics({ ...tactics, [key]: p.name })}
                      >
                        {shortName(p.name)}
                      </button>
                    ))}
                  </ChipRow>
                )}
              </div>
            )
          })
        : null}
      {side === 'off' && playbook >= 1 ? (
        <div className="posbar">
          <span className="cap">Tempo</span>
          <ChipRow>
            {(['slow', 'normal', 'fast'] as const).map((k) => (
              <button key={k} className={`sortb ${tactics.tempo === k ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, tempo: k })}>
                {k}
              </button>
            ))}
          </ChipRow>
        </div>
      ) : null}
      {side === 'off' && playbook >= 2 ? (
        <div className="posbar">
          <span className="cap">Playstyle</span>
          <ChipRow>
            {STYLES.map(({ key, label }) => (
              <button key={key} className={`sortb ${tactics.style === key ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, style: key })}>
                {key === 'balanced' || user ? label : `${label} ${Math.round(styleFit(key, five, theirs, tactics))}`}
              </button>
            ))}
          </ChipRow>
        </div>
      ) : null}
      {/* HIS RULING: "When selenting pnr you have to select the 2 handler and screener". The
          pick-and-roll is two calls, so calling it opens two more rows — the same chips as
          Main scorer, the same five men. They open lit on the pair the engine would pick
          itself, so the call is never blank and never a mystery; naming a man who already
          holds the other job trades the two rather than putting one man in both. */}
      {side === 'off' && playbook >= 2 && (tactics.style === 'pnr' || tactics.style === 'pickpop')
        ? (() => {
            // recal_129: pick-and-pop is the same two men, so it opens the same two rows and
            // reads the same `pnr` field — only the engine's default screener differs
            const pair = tactics.style === 'pickpop' ? popPair(five, tactics.pnr) : pnrPair(five, tactics.pnr)
            const at = { handler: pair.handler?.name ?? '', screener: pair.screener?.name ?? '' }
            const call = (role: 'handler' | 'screener', name: string) => {
              const other = role === 'handler' ? 'screener' : 'handler'
              const next = { ...at, [role]: name }
              if (next[other] === name) next[other] = at[role] && at[role] !== name ? at[role] : (five.find((q) => q.name !== name)?.name ?? name)
              onTactics({ ...tactics, pnr: { handler: next.handler, screener: next.screener } })
            }
            return (
              [
                ['Handler', 'handler'],
                ['Screener', 'screener'],
              ] as const
            ).map(([label, role]) => (
              <div className="posbar" key={role}>
                <span className="cap">{label}</span>
                <ChipRow>
                  {five.map((p) => (
                    <button key={p.name} className={`sortb ${at[role] === p.name ? 'on' : ''}`} onClick={() => call(role, p.name)}>
                      {shortName(p.name)}
                    </button>
                  ))}
                </ChipRow>
              </div>
            ))
          })()
        : null}
      {/* HIS RULING: "In post up playstyle, there need to be a post up target." The mirror of
          the pair, for one man: calling post-up opens one more row, the same chips as Main
          scorer and the same five men. It opens lit on the hub the engine would feed itself,
          so the call is never blank; tapping the lit man is a no-op rather than a way to
          un-call it, exactly as the pair's rows behave. */}
      {side === 'off' && playbook >= 2 && tactics.style === 'postup'
        ? (() => {
            const hub = postMan(five, tactics.post).hub?.name ?? ''
            return (
              <div className="posbar">
                <span className="cap">Post target</span>
                <ChipRow>
                  {five.map((p) => (
                    <button key={p.name} className={`sortb ${hub === p.name ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, post: p.name })}>
                      {shortName(p.name)}
                    </button>
                  ))}
                </ChipRow>
              </div>
            )
          })()
        : null}
      {/* HIS RULING: "Add pick n pop". One line so the difference from the roll is on the
          screen and not only in the number: the screener shoots instead of diving. */}
      {side === 'off' && playbook >= 2 && tactics.style === 'pickpop' ? (
        <div className="posbar superseded">
          <span className="cap">Pick-and-pop</span>
          <span className="tnote">the screener steps out — his jumper, not his roll</span>
        </div>
      ) : null}
      {/* HIS RULING: "Add Triangle". The triangle names nobody — it is a read, not a call on a
          man — so instead of a chip row it says what the engine found: who the entry pass
          goes to, and how many men on the floor can play out of it. */}
      {side === 'off' && playbook >= 2 && tactics.style === 'triangle'
        ? (() => {
            const post = postOption(five)
            const readers = triangleReaders(five).length
            return (
              <div className="posbar superseded">
                <span className="cap">Triangle</span>
                <span className="tnote">
                  {post ? `${shortName(post.name)} on the block · ${readers} read${readers === 1 ? 'er' : 'ers'}` : 'no post option'}
                </span>
              </div>
            )
          })()
        : null}
      {/* HIS RULING: "In helio, allow me to pick a creator." The third one-man call, opening
          lit on the man the engine would run the offense through — and the row above it has
          just told him this same man is now his scorer and his playmaker too. */}
      {side === 'off' && playbook >= 2 && tactics.style === 'helio'
        ? (() => {
            const c = heliMan(five, tactics.helio).creator?.name ?? ''
            return (
              <div className="posbar">
                <span className="cap">Creator</span>
                <ChipRow>
                  {five.map((p) => (
                    <button key={p.name} className={`sortb ${c === p.name ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, helio: p.name })}>
                      {shortName(p.name)}
                    </button>
                  ))}
                </ChipRow>
              </div>
            )
          })()
        : null}
      {side === 'off' && playbook >= 3 ? (
        <div className="posbar">
          <span className="cap">Hunt the mismatch</span>
          <ChipRow>
            <button className={`sortb ${tactics.hunt ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, hunt: !tactics.hunt })}>
              {tactics.hunt ? 'hunting' : 'off'}
            </button>
          </ChipRow>
        </div>
      ) : null}
      {/* the glass is two calls, not one: sending men to the offensive boards and ganging
          the defensive boards are priced apart, so each sits with its own side */}
      {side === 'off' && playbook >= 2 ? (
        <div className="posbar">
          <span className="cap">Crash the glass</span>
          <ChipRow>
            <button className={`sortb ${tactics.crashOff ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, crashOff: !tactics.crashOff })}>
              {tactics.crashOff ? 'crashing' : 'off'}
            </button>
          </ChipRow>
        </div>
      ) : null}
      {side === 'def' && playbook >= 3 ? (
        <div className="posbar">
          <span className="cap">Defensive scheme</span>
          <ChipRow>
            {SCHEMES.map(({ key, label }) => (
              <button key={key} className={`sortb ${tactics.scheme === key ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, scheme: key })}>
                {key === 'matchup' || user ? label : `${label} ${Math.round(schemeFit(key, five, theirs))}`}
              </button>
            ))}
          </ChipRow>
        </div>
      ) : null}
      {side === 'def' && playbook >= 2 ? (
        <div className="posbar">
          <span className="cap">Crash the glass</span>
          <ChipRow>
            <button className={`sortb ${tactics.crashDef ? 'on' : ''}`} onClick={() => onTactics({ ...tactics, crashDef: !tactics.crashDef })}>
              {tactics.crashDef ? 'crashing' : 'off'}
            </button>
          </ChipRow>
        </div>
      ) : null}
      {/* a side with nothing on it says what opens it, rather than going blank */}
      {playbook >= 1 && !sideHas[side] ? (
        <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
          Nothing to call on defense yet — the next Playbook rank opens the glass, and the one after it the scheme and the hunt.
        </div>
      ) : null}
      {(() => {
        if (user) return null
        if (playbook <= 0)
          return (
            <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
              Tactics are called from the bench: the PLAYBOOK node, at the end of the Coach branch, opens them — the men and the tempo first,
              then the shot diet and the glass, then the scheme and the hunt.
            </div>
          )
        const plan = gateTactics(tactics, playbook)
        const parts = tacticsParts(plan, five, theirs)
        return parts.length ? (
          <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
            {parts.map((x) => `${x.label} ${x.pts >= 0 ? '+' : '−'}${Math.abs(x.pts).toFixed(1)}`).join(' · ')}
            {/* the caveat is My team's, not the panel's: there the opponent is unknown, so the
                scheme and the hunt are priced on the five alone. At the draft he is standing
                right there and these ARE the full prices, so the line does not promise them again. */}
            {!theirs && (plan.scheme !== 'matchup' || plan.hunt) ? ' · the scheme and the hunt price fully at the draft, against the level’s five' : ''}
            {plan.tempo !== 'normal'
              ? ` · ${plan.tempo} pace: your surplus ${usageSurplus(five) >= 0 ? '+' : ''}${usageSurplus(five).toFixed(0)}${
                  theirs ? '' : ' — the matchup readout is at the draft'
                }`
              : ''}
          </div>
        ) : (
          <div className="seriesnow-note" style={{ paddingBottom: 10 }}>
            Every call is priced by the five you actually have — with the grain it pays, against it it costs.
            {playbook < 3 ? ` The next Playbook rank opens ${playbook === 1 ? 'the shot diet and the glass' : 'the scheme and the hunt'}.` : ''}
          </div>
        )
      })()}
    </>
  )
}
