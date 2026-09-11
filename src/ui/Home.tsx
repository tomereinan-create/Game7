import { type CampaignMode, type Progress, type Team } from '../state/campaign'
import { useUserMode } from '../state/viewmode'
import { FrontDoor } from './FrontDoor'

export type Mode = CampaignMode | 'database' | 'archetypes' | 'versus' | 'auction' | 'custom' | 'achievements' | 'teams'

export interface Era {
  name: string
  years: [number, number]
  first: number
}

/**
 * ONE FRONT DOOR NOW, FOR BOTH MODES — his ruling, 2026-09-09: "Change the user mode main screen
 * to look like the scout mode."
 *
 * WHAT THIS FILE USED TO SAY, and it is being reversed on purpose: "TWO FRONT DOORS, ONE FOR EACH
 * MODE ... The fork is here and nowhere else — a component apiece rather than a `user ?` running
 * through one screen — so neither can drift into the other." That was written under his earlier
 * ruling ("I want scout mode home screen to be 4a. Only scout mode"), when the two doors were
 * meant to be two different rooms. They are one room now, so the reason for two components has
 * gone with it: a second copy of a court, six chalk men and a pass in the air would drift apart
 * inside a week, and the thing that must NOT drift is the very thing both doors now share.
 *
 * So `UserHome` — the hero, the mode question, tonight's slate of cards, the 150 rungs printed
 * across the campaign card, the three side tiles — is deleted, and both modes render `FrontDoor`.
 * The mode is read HERE, once, and handed down as a prop, so the whole difference between the two
 * doors is one boolean and the three places FrontDoor spends it:
 *   · WHICH CHIP IS LIT, USER or SCOUT. A user who cannot get back to scout mode is stuck.
 *   · WHETHER THE BOOK IS ALONG THE FOOT. Database, Archetypes, Teams and Trophies show engine
 *     ratings, and user mode has no doors to them by his standing ruling, so user mode's slate
 *     closes on the sign-off instead of on four scout-only rooms.
 *   · WHERE THE CUP STANDS. His ruling "Add a trophy for EVERY mode at 150 wins" put a cup on the
 *     old user-mode cards; on the slate it stands in the mark of any ladder that is finished.
 * Everything else on the screen — the floor, the six marks, the men, the pass, the read — is one
 * drawing rendered twice, which is what keeps scout's board and user's board the same board.
 */
export function Home(props: { progress: Record<CampaignMode, Progress>; team: Team | null; onPick: (m: Mode) => void }) {
  return <FrontDoor user={useUserMode()} {...props} />
}
