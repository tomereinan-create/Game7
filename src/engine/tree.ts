import { ROUNDS } from '../config'
import { PLAYERS } from './pool'
import type { Rng } from './rng'
import { eligible, type Pos } from './positions'
import type { Player } from './types'

/**
 * The staff tree. Stars are a within-campaign currency: earned per level
 * (1 for winning in the last game, 2 for a shorter win, 3 for a sweep — the
 * earning rule is fixed), spent here, gone when the campaign is reset. Every
 * node widens options; none adds a point of rating.
 *
 * RANKED (his ruling: no skill is a one-time skill). Every node holds several
 * ranks, each costing one star, and each rank widens the node further — a third
 * respin, a deeper look down the map, another five points of payroll. A node's
 * ranks are listed in `rankBlurbs`, one line per rank, and the UI shows the
 * filled pips as x/N. The chain gate is unchanged: one rank in the node before
 * it opens the next node, so a branch can be walked wide or deep.
 */
export type Branch = 'Scout' | 'Front office' | 'Coach' | 'Salary' | 'Survival'
export type NodeId =
  | 'scout_ratings'
  | 'scout_reads'
  | 'scout_wheel'
  | 'fo_spin'
  | 'fo_respin'
  | 'fo_decade'
  | 'fo_division'
  | 'coach_optimal'
  | 'coach_manual'
  | 'coach_sigma'
  | 'coach_tactics'
  | 'cap'
  | 'surv_life'
  | 'surv_save'
  | 'surv_sub'
  | 'surv_dura'

export interface Node {
  id: NodeId
  branch: Branch
  name: string
  blurb: string
  /** How many ranks it holds. Each costs one star. */
  ranks: number
  /** What each rank buys, in order. `rankBlurbs[r - 1]` describes rank r. */
  rankBlurbs: string[]
  /** Skill tree: the node before it in the branch must be owned first. */
  requires?: NodeId
  /** Row in the branch column — the tree draws its connectors from this. */
  depth: number
}

/**
 * Every rank costs one star (Tomer's ruling). The tree is a checklist you work
 * through over a 120-level campaign, not a scarcity puzzle.
 */
export const NODE_PRICE = 1
/** Par: every level won without a sweep and without going the distance — 1.5 a level on average. */
export const PAR_STARS_PER_LEVEL = 1.5
export const parIncome = () => Math.round(ROUNDS * PAR_STARS_PER_LEVEL)

export const NODES: Node[] = [
  {
    id: 'scout_ratings', branch: 'Scout', depth: 0, ranks: 3,
    name: 'Exact ratings',
    blurb: 'The opponent card gives up its numbers, one layer at a time.',
    rankBlurbs: [
      'The opponent card shows the exact axis numbers, not just the bars.',
      'Their five break out into individual rating rows — OVR, OFF, DEF, man by man.',
      'And any of their men opens his full attribute sheet, right there on the card.',
    ],
  },
  {
    id: 'scout_reads', branch: 'Scout', depth: 1, ranks: 2, requires: 'scout_ratings',
    name: 'Matchup reads',
    blurb: 'What they will try to do to you, before you draft.',
    rankBlurbs: [
      'Their hunt orientation, steal target and anchor hiding spot.',
      'Their defensive board against your five: who picks up whom.',
    ],
  },
  {
    id: 'scout_wheel', branch: 'Scout', depth: 2, ranks: 2, requires: 'scout_reads',
    name: 'Sight seeing',
    blurb: 'Know your next spin before you take it.',
    rankBlurbs: ['The next landing, before you spin.', 'And the roster it brings — the men you would be choosing from.'],
  },
  {
    id: 'fo_spin', branch: 'Front office', depth: 0, ranks: 3,
    name: 'Extra spin',
    blurb: 'Respin a team you don’t like.',
    rankBlurbs: ['One extra landing.', 'A second.', 'A third.'],
  },
  {
    id: 'fo_respin', branch: 'Front office', depth: 1, ranks: 3, requires: 'fo_spin',
    name: 'Version respin',
    blurb: 'Reroll a drafted player’s season. Same man, another year.',
    rankBlurbs: ['One season reroll.', 'A second.', 'A third.'],
  },
  {
    id: 'fo_decade', branch: 'Front office', depth: 2, ranks: 2, requires: 'fo_respin',
    name: 'Decade spin',
    blurb: 'The wheel opens the franchise’s whole era, not one season.',
    rankBlurbs: [
      'Every man who wore the shirt in that decade.',
      'The decade either side of it as well — thirty years of the franchise.',
    ],
  },
  {
    id: 'fo_division', branch: 'Front office', depth: 3, ranks: 2, requires: 'fo_decade',
    name: 'Division spin',
    blurb: 'The wheel opens that season’s whole division, not one team.',
    rankBlurbs: ['That season’s division.', 'That season’s entire conference.'],
  },
  {
    id: 'coach_optimal', branch: 'Coach', depth: 0, ranks: 2,
    name: 'Matchup coaching',
    blurb: 'Defensive assignments stop being naive.',
    rankBlurbs: [
      'Assignments go from naive to optimal: the anchor hides on their worst shooter.',
      'And the draft screen prices it — what the assignment is worth, in points of spread.',
    ],
  },
  {
    id: 'coach_manual', branch: 'Coach', depth: 1, ranks: 2, requires: 'coach_optimal',
    name: 'Matchup board',
    blurb: 'Assign every defender yourself; the engine scores your board.',
    rankBlurbs: ['The board: drag a defender onto a man.', 'A solve button — the engine fills its own board for you to tweak.'],
  },
  {
    id: 'coach_sigma', branch: 'Coach', depth: 2, ranks: 3, requires: 'coach_manual',
    name: 'Tempo control',
    blurb: 'Choose the night’s noise before a level, for both teams.',
    rankBlurbs: ['Tight (σ 8), normal (10) or loose (13).', 'σ 6 and σ 16 open up.', 'σ 4 and σ 20 open up — a coin flip or a formality.'],
  },
  {
    id: 'coach_tactics', branch: 'Coach', depth: 3, ranks: 3, requires: 'coach_sigma',
    name: 'Playbook',
    blurb: 'Death match only: the tactics called from the My team screen.',
    rankBlurbs: [
      'Name your main scorer and main playmaker, and set the tempo.',
      'The shot diet, and crashing the glass.',
      'The defensive scheme, and hunting the mismatch.',
    ],
  },
  {
    id: 'surv_life', branch: 'Survival', depth: 0, ranks: 3,
    name: 'Extra life',
    blurb: 'Death match only: a loss you walk away from.',
    rankBlurbs: ['One loss absorbed. The run goes on.', 'A second.', 'A third — and then you are on your own.'],
  },
  {
    id: 'surv_save', branch: 'Survival', depth: 1, ranks: 3, requires: 'surv_life',
    name: 'Saving point',
    blurb: 'Death match only: how far back a lost run throws you.',
    rankBlurbs: [
      'A checkpoint at level 20 — a lost run restarts there, not at one.',
      'At level 40.',
      'At level 60. Half the ladder can never be taken from you.',
    ],
  },
  {
    id: 'surv_sub', branch: 'Survival', depth: 2, ranks: 2, requires: 'surv_save',
    name: 'Extra sub',
    blurb: 'Death match only: how many men you may change before a level.',
    rankBlurbs: ['A second change every round.', 'A third.'],
  },
  {
    id: 'surv_dura', branch: 'Survival', depth: 3, ranks: 3, requires: 'surv_sub',
    name: 'Iron men',
    blurb: 'Death match only: every man on the five carries more durability.',
    rankBlurbs: ['+10 durability, every man, the whole run.', '+20.', '+30 — built for the long haul.'],
  },
  {
    id: 'cap', branch: 'Salary', depth: 0, ranks: 4,
    name: 'Payroll room',
    blurb: 'Salary Cap campaign only: each rank buys five more points of cap.',
    rankBlurbs: ['Luxury tax: ceiling +5%.', 'Another +5%.', 'Repeater tax: another +5%.', 'Owner’s blank cheque: another +5%.'],
  },
]
export const NODE = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, Node>
export const price = (_id: NodeId) => NODE_PRICE
/** Every star the tree can absorb. */
export const treeCost = () => NODES.reduce((a, n) => a + n.ranks * NODE_PRICE, 0)

export interface Wallet {
  /** Stars earned (the map's total — best per level). */
  stars: number[]
  spent: number
  nodes: Partial<Record<NodeId, number>>
}

export const earned = (w: Wallet) => w.stars.reduce((a, b) => a + b, 0)
export const balance = (w: Wallet) => earned(w) - w.spent
/** Ranks held in a node, 0 if untouched. */
export const rank = (w: Wallet, id: NodeId) => Math.min(w.nodes[id] ?? 0, NODE[id]?.ranks ?? 0)
/** Owned at all — the gate every consumer that doesn't care about depth uses. */
export const owned = (w: Wallet, id: NodeId) => rank(w, id) > 0
export const maxed = (w: Wallet, id: NodeId) => rank(w, id) >= NODE[id].ranks
/** One rank in the node before it opens the next node. */
export const unlocked = (w: Wallet, id: NodeId) => !NODE[id].requires || owned(w, NODE[id].requires!)
export const canBuy = (w: Wallet, id: NodeId) => balance(w) >= price(id) && !maxed(w, id) && unlocked(w, id)

/** Death match: lives bought, checkpoint level reached, and men changeable per round. */
export const livesBought = (w: Wallet) => rank(w, 'surv_life')
export const checkpointLevel = (w: Wallet) => [0, 20, 40, 60][rank(w, 'surv_save')] ?? 0
export const subsPerRound = (w: Wallet) => 1 + rank(w, 'surv_sub')
/** Death match: extra durability every carried man gets, read at evaluation so buying it helps the CURRENT five too. */
export const duraBoost = (w: Wallet) => rank(w, 'surv_dura') * 10
/** Death match: how much of the My team playbook is open. 0 none, 1 the men and the tempo, 2 the diet and the glass, 3 everything. */
export const playbookRank = (w: Wallet) => rank(w, 'coach_tactics')

/** Extra payroll room bought in the Salary branch, in points of the cap. */
export const capBonus = (w: Wallet) => rank(w, 'cap') * 5

/** Respec: every star back, every node gone. Earned stars are untouched. */
export const respec = <W extends Wallet>(w: W): W => ({ ...w, spent: 0, nodes: {} })

/**
 * A wallet saved before the tree was ranked can name nodes that no longer exist
 * (the old fo_spin2 / cap3 shape). Drop them and re-derive `spent` from the ranks
 * that survive, so nobody is charged for a node they can no longer see.
 */
export function migrate<W extends Wallet>(w: W): W {
  const nodes: Partial<Record<NodeId, number>> = {}
  let spent = 0
  for (const [id, n] of Object.entries(w.nodes ?? {}) as [NodeId, number][]) {
    const node = NODE[id]
    if (!node || !n) continue
    const r = Math.min(n, node.ranks)
    nodes[id] = r
    spent += r * NODE_PRICE
  }
  return { ...w, spent, nodes }
}

/** Returns the wallet after buying a rank, or null if it can't be afforded / is already maxed. */
export function buy<W extends Wallet>(w: W, id: NodeId): W | null {
  if (!canBuy(w, id)) return null
  return { ...w, spent: w.spent + price(id), nodes: { ...w.nodes, [id]: rank(w, id) + 1 } }
}

/**
 * Version respin: the same player, another season from the pool, at random,
 * still eligible for the slot he holds. Null if he has no other season.
 */
export function respinSeason(p: Player, rng: Rng, slot?: Pos, lines?: Record<string, { pos?: string[] } | null>): Player | null {
  const others = PLAYERS.filter((q) => q.player === p.player && q.name !== p.name && (!slot || eligible(lines?.[q.name]?.pos).includes(slot)))
  if (!others.length) return null
  return others[Math.floor(rng.next() * others.length)]
}
