import TEAMSEASONS from './teamseasons.json'

/** One real team-season on the wheel: the year, the franchise, and its men in the card pool. */
export interface TeamSeason {
  y: number
  c: 'E' | 'W'
  team: string
  ab: string
  /** Division that season (four before the 2004 realignment, six after), and the team's record. */
  div: string | null
  rec: string | null
  p: string[]
}

export const WHEEL = TEAMSEASONS as TeamSeason[]
