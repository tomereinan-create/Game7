/**
 * USER MODE'S RAIL ON THE DRAFT — one section, and this is all that is left of it.
 *
 * WHAT IT WAS. User mode used to be SUBTRACTIVE: every screen deleted its ratings, its spread and
 * its odds and left the hole where they had been. The design bundle answered that with a rail of
 * its own — the man in focus on franchise blue (ManHead), the archetype's sentence under THE
 * SCOUT'S WORD (ScoutsWord), how far through the draft you were (DraftProgress), the opponent's
 * three biggest men and what they really did (TaleOfTheTape), and what a coach would say out loud
 * with no number in it (CoachSays).
 *
 * WHAT WENT, AND ON WHOSE WORD.
 *   · DraftProgress — his ruling, 2026-09-08. "None in yet · 5 to go · Playing blind" was the
 *     screen narrating itself; the wheel card counts the spin and the five's card counts the picks.
 *   · ManHead and ScoutsWord — his ruling, 2026-09-09: "Remove the player info on buttom right
 *     from user mode." A man's own card, one tap away on any floor or row, says all of it and more.
 *   · TaleOfTheTape — his ruling, 2026-09-09, naming the game-night rail line by line: "Level 16 ·
 *     best of 7 / 45–37 / Orlando Magic / Tale of the tape / Their real season / … / Legs left in
 *     the five". The blue head and LegsLeft (in JerseyFive) went with it.
 *
 * WHAT STANDS: CoachSays, under the heading he named it — "Add coacing tips category instead."
 * Their `um-head`, `um-word`, `um-foot`, `um-seg` and `um-tape` styling is left in the stylesheet;
 * nothing else claims those names, and they are the shapes this rail would use again.
 *
 * Everything printed here is a FACT — a sentence about who the ball goes to, who has their best
 * man, where the glass stands. Nothing on this rail prices a decision, which is the whole point of
 * the mode.
 */

/**
 * COACHING TIPS — the same three things scout mode prices as keys, said out loud with the number
 * taken off. The sentences are built from the five and the opponent's five, so they change with
 * the team; what they never do is tell you whether the call was good.
 *
 * HIS RULING, 2026-09-09: "Add coacing tips category instead." The block used to be headed WHAT
 * YOUR COACH SAYS and stood third of four on the game-night rail; the rail is gone and this is
 * what he asked to stand in its place, so it takes the name he gave it and stands alone.
 */
export function CoachSays({ lines }: { lines: string[] }) {
  if (!lines.length) return null
  return (
    <div className="um-coach">
      <span className="um-h">Coaching tips</span>
      {lines.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </div>
  )
}
