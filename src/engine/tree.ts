import { ROUNDS } from '../config'
import CAMPAIGNS from '../data/campaigns.json'
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
 * ranks and each rank widens the node further — a third respin, a deeper look
 * down the map, another five points of payroll. A node's ranks are listed in
 * `rankBlurbs`, one line per rank, and the UI shows the filled pips as x/N. The
 * chain gate is unchanged: one rank in the node before it opens the next node,
 * so a branch can be walked wide or deep. What a rank costs is `price` below.
 *
 * THE DYNASTY BRANCH (his ruling, 2026-10-23: "B, optionally combined with A's milder version", and
 * "Build as listed"). One node per tier of the ladder above the first, each opening the moment the
 * ladder REACHES its tier — the level before it cleared — so a campaign that has bought the rest of
 * the tree still has something to save for at 31, at 91 and at 121. The campaign and the salary cap
 * sell it; the death match does not (another session's lane, and its economy is not touched here).
 * Its one-rank node, Scout's pick, is the single exception to "no skill is a one-time skill", and it
 * is his: it was in the list he approved as listed.
 */
export type Branch = 'Scout' | 'Front office' | 'Coach' | 'Salary' | 'Survival' | 'Dynasty'
export type NodeId =
  | 'scout_ratings'
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
  | 'surv_bench'
  | 'dyn_same'
  | 'dyn_spin'
  | 'dyn_pick'

export interface Node {
  id: NodeId
  branch: Branch
  name: string
  blurb: string
  /** How many ranks it holds. What each one costs is `price`. */
  ranks: number
  /** What each rank buys, in order. `rankBlurbs[r - 1]` describes rank r. */
  rankBlurbs: string[]
  /** Skill tree: the node before it in the branch must be owned first. */
  requires?: NodeId
  /** Row in the branch column — the tree draws its connectors from this. */
  depth: number
  /**
   * The Dynasty branch: the level the ladder has to REACH before a rank can be bought — the first
   * level of the node's tier, open once the level before it is cleared. Owned ranks keep working
   * whatever the map says afterwards; only the buying waits.
   */
  opensAt?: number
  /** A price of its own, in stars a rank, for a node the row rule below does not price (Dynasty). */
  cost?: number
}

/**
 * WHAT A RANK COSTS (his ruling, 2026-10-23: "B, optionally combined with A's milder version" —
 * "Yes, the milder pricing"). A rank costs its node's ROW in the branch plus one: the top row one
 * star, the next two, then three, then four. Scout is 7★, Front office 23★ and Coach 27★ — 57 stars
 * for the 25 ranks the flat price sold for 25, which his pace (2.6★ a level) had bought out by
 * about level 10 of 150, after which stars bought nothing. Payroll room sits on its branch's top
 * row, so it stays one star. The Dynasty branch carries its own prices (3, 4 and 5 a rank).
 *
 * THE DEATH MATCH KEEPS ONE STAR A RANK, every node in it — Survival as the ruling names it, and the
 * staff it rebuilds after every death too. It is another session's lane and this change does not
 * touch its economy; `price(id, true)` is that flat star.
 *
 * Prices apply to purchases from the day they changed: a rank bought before it was paid one star,
 * `spent` remembers what was actually paid, and a respec hands back exactly that (see `migrate`).
 */
export const NODE_PRICE = 1
/**
 * The first level of each tier of the ladder, by its id in campaigns.json — The Champions open at
 * 31, All-Time at 91, The Customs at 121. Read off the ladder rather than typed, so a tier that is
 * resized moves its Dynasty gate with it; the fallback is only for a ladder that lost a tier.
 */
const TIER_FIRST: Record<string, number> = {}
;(CAMPAIGNS as unknown as { id: string; levels: unknown[] }[]).reduce((n, t) => ((TIER_FIRST[t.id] = n + 1), n + t.levels.length), 0)
const tierFirst = (id: string, fallback: number) => TIER_FIRST[id] ?? fallback
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
  /* MATCHUP READS IS GONE (his report, 2026-10-22: "nothing in the code uses it. It costs 2 stars
     for no effect, and you have to buy it to reach Sight seeing"). Its block left the draft on his
     ruling of 2026-08-30 and the node stayed behind as a toll. Sight seeing hangs off Exact ratings
     now, and a save that owned it gets the stars back: `migrate` drops a node it does not know and
     recounts `spent` from what is left. */
  {
    id: 'scout_wheel', branch: 'Scout', depth: 1, ranks: 2, requires: 'scout_ratings',
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
  /* WHAT THESE TWO RANKS ACTUALLY DO (his report, 2026-10-23: rank 1 said it makes "the anchor hide
     on their worst shooter", which the free naive board often does already — the naive coach parks
     the anchor on their most paint-bound man). What rank 1 buys is the other four: the naive coach
     guards position on position, the optimal one plays the best of the 120 boards. And the board
     opens on the matchups being played, so the solve button puts the best board back after a
     change rather than filling an empty one. */
  {
    id: 'coach_optimal', branch: 'Coach', depth: 0, ranks: 2,
    name: 'Matchup coaching',
    blurb: 'Defensive assignments stop being naive.',
    rankBlurbs: [
      'Assignments go from naive to optimal: instead of position on position, every defender goes on the man he gives up least to — the best of the 120 boards.',
      'And the draft screen prices it — what your assignment is worth against the naive one, in points of margin.',
    ],
  },
  {
    id: 'coach_manual', branch: 'Coach', depth: 1, ranks: 2, requires: 'coach_optimal',
    name: 'Matchup board',
    blurb: 'Assign every defender yourself; the engine scores your board.',
    rankBlurbs: [
      'The board, opened on the matchups your staff plays: drag a defender onto a man to change one. Left alone, or put back, it costs nothing.',
      'A solve button — one press puts the engine’s best board back after you have changed it.',
    ],
  },
  {
    id: 'coach_sigma', branch: 'Coach', depth: 2, ranks: 3, requires: 'coach_manual',
    name: 'Tempo control',
    blurb: 'Pace is a read — surpluses, not noise. Master the call.',
    rankBlurbs: [
      'The pace readout: both surpluses show at the draft, so the call reads the matchup.',
      'A trained bench wastes less — the tempo deviation tax is halved.',
      'Your call carries the night: 85% of the pace is yours, however they answer.',
    ],
  },
  {
    id: 'coach_tactics', branch: 'Coach', depth: 3, ranks: 3, requires: 'coach_sigma',
    name: 'Playbook',
    /* IT WAS NEVER THE DEATH MATCH'S ALONE — the node has always been on the Coach branch, which
       every mode is offered (his report: "Tactics arent visable in boths campaigns(Salary and
       normal)"). The line said "Death match only" because the panel was born on the My team
       screen, which IS the death match's; the calls are made on the draft in the other two. */
    blurb: 'The tactics: called on the draft, and in the death match on the My team screen.',
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
    id: 'surv_bench', branch: 'Survival', depth: 4, ranks: 2, requires: 'surv_dura',
    name: 'The bench',
    blurb: 'Death match only: a sixth man. He does not play — he rests, and resting heals.',
    rankBlurbs: [
      'A sixth roster spot. The man on it recovers 3 durability a series, never past his own card.',
      'He recovers 6 — a real rotation, one man at a time.',
    ],
  },
  {
    id: 'cap', branch: 'Salary', depth: 0, ranks: 4,
    name: 'Payroll room',
    blurb: 'Salary Cap campaign only: each rank buys five more points of cap.',
    rankBlurbs: ['Luxury tax: ceiling +5%.', 'Another +5%.', 'Repeater tax: another +5%.', 'Owner’s blank cheque: another +5%.'],
  },
  /* THE DYNASTY BRANCH — one node a tier, see the head of this file. No chain between them: each is
     opened by the ladder, not by the node above it. */
  {
    id: 'dyn_same', branch: 'Dynasty', depth: 0, ranks: 2, cost: 3, opensAt: tierFirst('champs', 31),
    name: 'Same roster again',
    blurb: 'Back to the roster you just drafted from — a second man off a stacked team-season.',
    rankBlurbs: [
      'Once a draft, the next spin re-lands on it — while it still has a man your five can take.',
      'Twice a draft.',
    ],
  },
  {
    id: 'dyn_spin', branch: 'Dynasty', depth: 1, ranks: 2, cost: 4, opensAt: tierFirst('alltime', 91),
    name: 'Extra spin+',
    blurb: 'Extra spin, past its three: more respins every draft.',
    rankBlurbs: ['One more extra landing every draft, on top of Extra spin’s — a fourth, with all three of its ranks.', 'And one more — a fifth.'],
  },
  {
    id: 'dyn_pick', branch: 'Dynasty', depth: 2, ranks: 1, cost: 5, opensAt: tierFirst('customs', 121),
    name: 'Scout’s pick',
    blurb: 'You choose the franchise; the year still spins.',
    rankBlurbs: ['Once a draft, pick the team reel yourself — the spin lands on one of that franchise’s seasons with a man your five can take.'],
  },
]
export const NODE = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<NodeId, Node>
/**
 * Stars a rank of this node costs (see NODE_PRICE above for the ruling): its own `cost` where it has
 * one, one star flat on the Survival branch, and its row plus one everywhere else. `death` is the
 * death match, which keeps one star a rank for every node.
 */
export const price = (id: NodeId, death = false): number => {
  const n = NODE[id]
  if (death || !n) return NODE_PRICE
  return n.cost ?? (n.branch === 'Survival' ? NODE_PRICE : n.depth + 1)
}
/** Every star the tree can absorb — over the branches given (every branch by default). */
export const treeCost = (branches?: Branch[], death = false) =>
  NODES.filter((n) => !branches || branches.includes(n.branch)).reduce((a, n) => a + n.ranks * price(n.id, death), 0)

export interface Wallet {
  /** Stars earned (the map's total — best per level). */
  stars: number[]
  spent: number
  nodes: Partial<Record<NodeId, number>>
  /**
   * Stars earned on a LADDER THAT NO LONGER EXISTS, kept as credit. When the campaign was rebuilt
   * around his ruling the levels past the first thirty became different opponents, so their stars
   * could not stay on the map — but they were won, and they had already been spent in the staff
   * tree. Carrying them here is what keeps a bought node bought. Nothing else adds to it.
   */
  credit?: number
  /**
   * Stars spent on single-use BOOSTS (see BOOSTS below). Kept apart from `spent` because a respec
   * hands back everything in `spent`, and a boost is used up by the attempt it was bought for — it
   * is gone, so its stars are too. Absent on every save from before the boosts, which is zero.
   */
  boosted?: number
  /**
   * Which price list `spent` was paid at. Absent: a save from before 2026-10-23, when every rank was
   * one star, so its spend is re-derived from its ranks at one star exactly as it always was. 2:
   * `spent` is the record of what was paid, rank by rank at whatever each cost, and is kept as it
   * stands. See `migrate`.
   */
  pricing?: number
}

export const earned = (w: Wallet) => w.stars.reduce((a, b) => a + b, 0) + (w.credit ?? 0)
/** Stars in hand: earned, less the tree, less the boosts. */
export const balance = (w: Wallet) => earned(w) - w.spent - (w.boosted ?? 0)
/** Ranks held in a node, 0 if untouched. */
export const rank = (w: Wallet, id: NodeId) => Math.min(w.nodes[id] ?? 0, NODE[id]?.ranks ?? 0)
/** Owned at all — the gate every consumer that doesn't care about depth uses. */
export const owned = (w: Wallet, id: NodeId) => rank(w, id) > 0
export const maxed = (w: Wallet, id: NodeId) => rank(w, id) >= NODE[id].ranks
/**
 * The level the ladder stands on: the first one not yet cleared, read the way the map reads it
 * (state/campaign.ts `currentLevel`) — one past the top when every level is cleared.
 */
export const frontier = (w: Pick<Wallet, 'stars'>) => {
  const i = w.stars.findIndex((s) => s === 0)
  return i === -1 ? w.stars.length + 1 : i + 1
}
/** A Dynasty node's tier has been reached: the ladder stands on its first level or past it. */
export const tierOpen = (w: Pick<Wallet, 'stars'>, id: NodeId) => !NODE[id].opensAt || frontier(w) >= NODE[id].opensAt!
/** One rank in the node before it opens the next node — and a Dynasty node waits for its tier. */
export const unlocked = (w: Wallet, id: NodeId) => (!NODE[id].requires || owned(w, NODE[id].requires!)) && tierOpen(w, id)
export const canBuy = (w: Wallet, id: NodeId, death = false) => balance(w) >= price(id, death) && !maxed(w, id) && unlocked(w, id)

/** Death match: lives bought, checkpoint level reached, and men changeable per round. */
export const livesBought = (w: Wallet) => rank(w, 'surv_life')
export const checkpointLevel = (w: Wallet) => [0, 20, 40, 60][rank(w, 'surv_save')] ?? 0
export const subsPerRound = (w: Wallet) => 1 + rank(w, 'surv_sub')
/** Death match: extra durability every carried man gets, read at evaluation so buying it helps the CURRENT five too. */
export const duraBoost = (w: Wallet) => rank(w, 'surv_dura') * 10
/** How much of the playbook is open, in every mode. 0 none, 1 the men and the tempo, 2 the diet and the glass, 3 everything. */
export const playbookRank = (w: Wallet) => rank(w, 'coach_tactics')
/** Tempo control (r59 repurpose): pace mastery — 1 the readout, 2 half tax, 3 an 85% call. */
export const paceMastery = (w: Wallet) => rank(w, 'coach_sigma')
/** Death match: durability the benched man recovers per settled series (0 = no bench at all). */
export const benchHeal = (w: Wallet) => [0, 3, 6][rank(w, 'surv_bench')] ?? 0

/** Extra payroll room bought in the Salary branch, in points of the cap. */
export const capBonus = (w: Wallet) => rank(w, 'cap') * 5

/**
 * EXTRA LANDINGS A DRAFT — the Respin team charges. Extra spin's ranks; Extra spin+'s on top of them
 * (the Dynasty branch, so never in the death match); and one more for a Timeout boost in the attempt.
 */
export const extraSpins = (w: Wallet, death = false, boosts: readonly BoostId[] = []) =>
  rank(w, 'fo_spin') + (death ? 0 : rank(w, 'dyn_spin')) + (!death && boosts.includes('timeout') ? 1 : 0)
/** Same roster again: re-landings a draft (Dynasty, not the death match). */
export const sameRosterUses = (w: Wallet, death = false) => (death ? 0 : rank(w, 'dyn_same'))
/** Scout's pick: franchises chosen a draft (Dynasty, not the death match). */
export const scoutsPicks = (w: Wallet, death = false) => (death ? 0 : rank(w, 'dyn_pick'))

/**
 * Respec: every star the TREE took comes back, every node gone. Earned stars are untouched, and so
 * are the boosts — they were used up by the attempts they were bought for (`boosted`).
 */
export const respec = <W extends Wallet>(w: W): W => ({ ...w, spent: 0, nodes: {} })

/** The price list `spent` is kept at from 2026-10-23 on — see `Wallet.pricing`. */
export const PRICING = 2

/**
 * A wallet saved before the tree was ranked can name nodes that no longer exist
 * (the old fo_spin2 / cap3 shape). Drop them, so nobody is charged for a node they can no longer see.
 *
 * AND WHAT IT PAID IS WHAT IT PAID (2026-10-23, the per-node prices). A save from before the prices
 * changed bought every rank at one star, so its `spent` is re-derived from the ranks that survive at
 * one star — exactly what this always did, so its balance does not move by a star. Re-deriving it at
 * the NEW prices would charge him again for ranks he already owns and push balances below zero. Once
 * migrated it carries `pricing: 2`, and from then on `spent` is the ledger itself — ranks bought at
 * one star and ranks bought at three sit in it side by side, and nothing recomputes them; a respec
 * refunds exactly that.
 */
export function migrate<W extends Wallet>(w: W): W {
  const nodes: Partial<Record<NodeId, number>> = {}
  let flat = 0
  for (const [id, n] of Object.entries(w.nodes ?? {}) as [NodeId, number][]) {
    const node = NODE[id]
    if (!node || !n) continue
    const r = Math.min(n, node.ranks)
    nodes[id] = r
    flat += r * NODE_PRICE
  }
  if ((w.pricing ?? 1) < PRICING) return { ...w, spent: flat, nodes, pricing: PRICING }
  return { ...w, spent: Math.max(0, w.spent), nodes, pricing: PRICING }
}

/** Returns the wallet after buying a rank, or null if it can't be afforded / is already maxed. */
export function buy<W extends Wallet>(w: W, id: NodeId, death = false): W | null {
  if (!canBuy(w, id, death)) return null
  return { ...w, spent: w.spent + price(id, death), nodes: { ...w.nodes, [id]: rank(w, id) + 1 } }
}

/**
 * SINGLE-USE BOOSTS FOR THE HARDER STAGES (his ruling, 2026-10-23: "we can add in game extra boosts
 * single use for harder stages" — "Build as listed"). Bought with stars on the draft before its first
 * spin, at most BOOST_MAX to an attempt and each kind once, and used up by that attempt: kept with
 * the draft in progress (state/draftsave.ts) until its series is simmed. The campaign and the salary
 * cap only. Their stars go to `boosted`, never to `spent`, so a respec cannot hand them back.
 */
export type BoostId = 'timeout' | 'film' | 'hothand'
export interface Boost {
  id: BoostId
  name: string
  /** Stars. */
  price: number
  /** What it does, in a line. */
  blurb: string
}
/** Hot hand: points added to every game's margin for the series (`Lineup.bonus`, odds.ts `night`). */
export const HOT_HAND = 1.5
export const BOOSTS: Boost[] = [
  { id: 'timeout', name: 'Timeout', price: 1, blurb: 'One more respin this draft.' },
  { id: 'film', name: 'Film session', price: 1, blurb: 'See the next two landings, this draft only.' },
  { id: 'hothand', name: 'Hot hand', price: 2, blurb: `+${HOT_HAND} points every game of this series.` },
]
export const BOOST = Object.fromEntries(BOOSTS.map((b) => [b.id, b])) as Record<BoostId, Boost>
/** At most this many boosts to a level attempt. */
export const BOOST_MAX = 2
export const isBoost = (x: unknown): x is BoostId => typeof x === 'string' && x in BOOST
/** Whether this boost can go into an attempt that already holds `held`: affordable, a kind not yet in it, room left. */
export const canBoost = (w: Wallet, id: BoostId, held: readonly BoostId[]) =>
  isBoost(id) && held.length < BOOST_MAX && !held.includes(id) && balance(w) >= BOOST[id].price
/** The wallet after paying for a boost, or null if it cannot be had. The attempt keeps the boost itself. */
export function buyBoost<W extends Wallet>(w: W, id: BoostId, held: readonly BoostId[]): W | null {
  if (!canBoost(w, id, held)) return null
  return { ...w, boosted: (w.boosted ?? 0) + BOOST[id].price }
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
