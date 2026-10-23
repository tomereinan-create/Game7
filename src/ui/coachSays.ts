import type { Player } from '../engine/types'
import { LINES } from './Stat'

const surname = (n: string) => {
  const bare = n.replace(/ '\d\d( \([a-z]\))?$/, '')
  return bare.split(' ').pop() ?? bare
}

/**
 * WHAT YOUR COACH SAYS (the design bundle, screen 5, user mode).
 *
 * Scout mode's rail prices three keys to the game — `Play through Malone +4.5`, `Jordan hunts
 * Stockton −0.9`, `Own the glass +0.7`. The bundle's user mode says the same three things with the
 * number taken off, because the number IS the verdict: knowing that the glass is worth seven
 * tenths of a point is scouting, and knowing that your two bigs have to want it is coaching.
 *
 * So these are the same three subjects, read off the same state — who your first option is, who
 * theirs is and who has to answer him, and where the rebounding stands — and stated as sentences
 * a man would say in a huddle. Nothing here is a rating, a spread or an odds line.
 */
export function coachSays(five: Player[], theirs: Player[], board: readonly number[] | null): string[] {
  if (five.length < 5 || theirs.length < 5) return []
  const out: string[] = []
  const ppg = (p: Player) => LINES[p.name]?.ppg ?? 0
  const rpg = (p: Player) => LINES[p.name]?.rpg ?? 0

  // 1. THE FIRST OPTION. Who the ball goes to, by what he actually scored.
  const mine = [...five].sort((a, b) => ppg(b) - ppg(a))
  const first = mine[0]
  out.push(
    `Play through ${surname(first.name)}. He put up more than anyone else on this floor did, and the offense should look for him first.`,
  )

  // 2. THEIR MAN, AND WHO HAS HIM. The board is a permutation of our five onto theirs, so the man
  //    who has to answer him is a lookup rather than a guess. It is the ACTIVE board, resolved by
  //    Matchups.tsx `activeBoard` — the one the ticker prints and the sheet opens on. This used to
  //    fall back to the naive board whenever the night was 'optimal', so with Matchup coaching
  //    owned the tip named a man the ticker had on somebody else (his report, 2026-10-23: "Poole
  //    has him" about Flagg while the ticker had Hibbert on him).
  const theirBest = [...theirs].sort((a, b) => ppg(b) - ppg(a))[0]
  const ti = theirs.indexOf(theirBest)
  const mi = board ? board.findIndex((t) => t === ti) : -1
  const guard = mi >= 0 ? five[mi] : null
  out.push(
    guard
      ? `${surname(theirBest.name)} is their night. ${surname(guard.name)} has him every time they switch, and he will not get help unless somebody leaves a shooter.`
      : `${surname(theirBest.name)} is their night, and nobody on this five is an obvious answer to him.`,
  )

  // 3. THE GLASS. Both teams' two best rebounders, said as a job rather than as a margin.
  const ourBoards = [...five].sort((a, b) => rpg(b) - rpg(a)).slice(0, 2)
  const theirBoards = [...theirs].sort((a, b) => rpg(b) - rpg(a)).slice(0, 2)
  const ours = ourBoards.reduce((a, p) => a + rpg(p), 0)
  const them = theirBoards.reduce((a, p) => a + rpg(p), 0)
  const names = ourBoards.map((p) => surname(p.name)).join(' and ')
  out.push(
    ours >= them
      ? `The glass is yours if ${names} want it. Second chances are where this one gets decided.`
      : `${theirBoards.map((p) => surname(p.name)).join(' and ')} own the glass on paper. ${names} have to make it a fight.`,
  )
  return out
}
