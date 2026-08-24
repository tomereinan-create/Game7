import { COACH_NET, GAMBLER_SIGMA } from '../config'
import type { Coach } from '../engine/types'

export const COACHES: Coach[] = [
  {
    id: 'def',
    name: 'The Sergeant',
    blurb: '+5 Interior D, +5 Perimeter D',
    mod: { id: 5, pd: 5, bonus: COACH_NET },
  },
  {
    id: 'off',
    name: 'The Professor',
    blurb: '+5 Inside O, +5 Outside O',
    mod: { in: 5, out: 5, bonus: COACH_NET },
  },
  {
    id: 'gambler',
    name: 'The Gambler',
    blurb: 'Game noise 17 instead of 14, for both teams',
    mod: {},
    sigma: GAMBLER_SIGMA,
  },
]

export const coachById = (id: string) => COACHES.find((c) => c.id === id) ?? COACHES[0]
