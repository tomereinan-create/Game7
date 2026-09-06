import { archetype } from '../engine/pool'
import type { Player } from '../engine/types'
import { RULE } from './Archetypes'
import { LINES } from './Stat'

/**
 * USER MODE'S RAILS (the design bundle, screens 4 and 5).
 *
 * User mode used to be SUBTRACTIVE: every screen deleted its ratings, its spread and its odds and
 * left the hole where they had been — the wheel's whole right-hand column went black the moment
 * the switch was thrown. The bundle's ruling is that facts stay and judgements go, which means
 * user mode has its own content rather than scout mode minus a column: the man's real season, the
 * tag's own sentence, how far through the draft you are, the opponent's real line, and what a
 * coach would say out loud with no number in it.
 *
 * Everything printed here is a FACT — a box line off the season, a sentence off the archetype
 * tree, a count of picks. Nothing on these rails prices a decision, which is the whole point of
 * the mode.
 */

const short = (n: string) => n.replace(/ '\d\d( \([a-z]\))?$/, '')
const f1 = (v: number | undefined) => (v === undefined ? '—' : v.toFixed(1))

/**
 * THE MAN IN FOCUS — his season, at the size the bundle sets it, on franchise blue. Three numbers
 * only: points, rebounds, assists. The rest of the box is one tap away on his own row, and this is
 * a headline, not a sheet.
 */
export function ManHead({ p, kicker }: { p: Player; kicker?: string }) {
  const line = LINES[p.name] ?? null
  return (
    <div className="um-head">
      <span className="um-kick">{kicker ?? `${short(p.name)} · ${p.peak_season}`}</span>
      <b>
        {line ? `${f1(line.ppg)} · ${f1(line.rpg)} · ${f1(line.apg)}` : 'No stat line on file'}
      </b>
      {line ? <i>Points · rebounds · assists</i> : null}
    </div>
  )
}

/**
 * THE SCOUT'S WORD. The archetype tree's own sentence about the tag he wears, then what his
 * position and his season say about where he stands. Both are description, not appraisal — the
 * tag is a shape, and the shape is a fact about the numbers, not a verdict on the pick.
 */
export function ScoutsWord({ p }: { p: Player }) {
  const tag = archetype(p)
  const line = LINES[p.name] ?? null
  return (
    <div className="um-word">
      <span className="um-cap">The scout's word</span>
      <p>{RULE[tag] ?? 'A tag from the tree.'}</p>
      {line ? (
        <p>
          {line.pos?.join(' / ') ?? '—'} in {p.peak_season}, {line.gp} games at {line.mpg ?? '—'} minutes
          {line.ts !== undefined ? `, shooting ${line.ts.toFixed(1)}% true` : ''}.
        </p>
      ) : null}
    </div>
  )
}

/**
 * HOW FAR THROUGH THE DRAFT YOU ARE, as five segments rather than a number of points. Blue is a
 * man taken, gold is the pick on the clock, dark is a slot still to fill — the same three states
 * the court's rings wear, so the two read as one thing.
 */
export function DraftProgress({ taken, size }: { taken: number; size: number }) {
  const left = size - taken
  return (
    <div className="um-foot">
      <div className="um-footline">
        <span className="um-cap">
          {taken === 0 ? 'None in yet' : taken === 1 ? 'One pick in' : `${taken} picks in`}
        </span>
        <b>{left === 0 ? 'The five is set' : left === 1 ? 'One to go' : `${left} to go`}</b>
      </div>
      <div className="um-seg">
        {Array.from({ length: size }, (_, i) => (
          <span key={i} className={i < taken ? 'in' : i === taken ? 'now' : ''} />
        ))}
      </div>
      <p>Playing blind — no ratings, no odds. Trust the eye and the box score.</p>
    </div>
  )
}

/**
 * TALE OF THE TAPE — the three men across from you who did the most that season, and what they
 * actually did. Their real line, never a rating: in user mode the opponent is scouted the way a
 * newspaper would scout him.
 */
export function TaleOfTheTape({ theirs }: { theirs: Player[] }) {
  const top = [...theirs]
    .map((p) => ({ p, line: LINES[p.name] ?? null }))
    .sort((a, b) => (b.line?.ppg ?? 0) - (a.line?.ppg ?? 0))
    .slice(0, 3)
  return (
    <div className="um-tape">
      <div className="um-tapehead">
        <span>Tale of the tape</span>
        <i>Their real season</i>
      </div>
      {top.map(({ p, line }) => (
        <div className="um-taperow" key={p.name}>
          <b>{short(p.name).split(' ').slice(-1)[0]}</b>
          <span>
            {line
              ? `${f1(line.ppg)} pts · ${line.fgp !== undefined ? `${line.fgp}% fg` : `${f1(line.apg)} ast`} · ${f1(line.rpg)} reb`
              : 'No stat line on file'}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * WHAT YOUR COACH SAYS — the same three things scout mode prices as keys, said out loud with the
 * number taken off. The sentences are built from the five and the opponent's five, so they change
 * with the team; what they never do is tell you whether the call was good.
 */
export function CoachSays({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return (
    <div className="um-coach">
      <span className="um-h">What your coach says</span>
      {lines.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </div>
  )
}
