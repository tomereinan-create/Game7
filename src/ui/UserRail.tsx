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
 * WHAT STANDS: CoachSays, under the heading he named it — "Add coacing tips category instead." It
 * no longer stands on the draft as a card at all: his ruling of 2026-09-09, "Move Coaching tips to
 * information button", put the same three sentences behind the `i` in the team sheet's head, so
 * this file now exports the tips AND the door that opens them, and user mode's game night is the
 * tip-off alone.
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
 * what he asked to stand in its place, so it takes the name he gave it.
 *
 * IT IS NO LONGER A CARD ON THE SCREEN — his later ruling of the same day: "Move Coaching tips to
 * information button". The three sentences are unchanged, word for word; what changed is that they
 * wait behind the `i` in the team sheet's head (`CoachTipsDoor` below) and open in a sheet, the
 * same way MATCHUP BOARD and PLAYBOOK open theirs. Inside that sheet the topbar already carries
 * the name, so the block is asked to drop its own heading rather than say it twice — which is all
 * `heading` is for. On any screen that puts this back in a card, the heading comes with it.
 */
export function CoachSays({ lines, heading = true }: { lines: string[]; heading?: boolean }) {
  if (!lines.length) return null
  return (
    <div className="um-coach">
      {heading ? <span className="um-h">Coaching tips</span> : null}
      {lines.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </div>
  )
}

/**
 * THE INFORMATION BUTTON (his ruling, 2026-09-09: "Move Coaching tips to information button").
 *
 * WHERE IT SITS, AND WHY THERE. The same ruling day left user mode's game night as the tip-off
 * alone, so there is exactly one card on that screen — the team sheet, headed with your franchise
 * and 5 OF 5 — and this stands at the end of that head. Three rooms were candidates:
 *   · the staff bar, as a third chip beside MATCHUP BOARD and PLAYBOOK. Rejected: that bar is only
 *     drawn for a wallet that has bought one of those two nodes, and the tips are free — hanging
 *     them there would hide them from the player who has bought nothing.
 *   · the scorebug or the club band. Rejected: the bug is a picture of a game that has not been
 *     played, and this app does not put controls inside its pictures; a 44px target would also
 *     have to grow a 30px band.
 *   · the card head, which is where every card in this app carries its controls (the wheel's
 *     RESPIN TEAM chip is one). Taken. It is the first line of the only card on the screen, so it
 *     cannot be hunted for, and it collides with nothing below it.
 *
 * HOW IT IS DRAWN: a round `i` at 20px inside a 44px target, in the accent, exactly as `CardDoor`
 * draws the person icon on a box score. Its negative margins are vertical only — the target keeps
 * its 44px, the head keeps its height.
 */
export function CoachTipsDoor({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="tips-door" aria-label="Coaching tips — what your coach says about this matchup" title="Coaching tips" onClick={onOpen}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="7.4" r="1.25" fill="currentColor" stroke="none" />
        <path d="M12 10.8v6.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    </button>
  )
}
