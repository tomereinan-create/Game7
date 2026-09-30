import { ROUNDS } from '../config'
import CAMPAIGNS from '../data/campaigns.json'
import { NODE, type Branch, type NodeId } from '../engine/tree'
import type { Opponent } from '../engine/types'
import type { AchDef } from '../state/achievements'
import type { CampaignMode } from '../state/campaign'
import type { Lesson, Step } from '../state/tutorial'
import type { Era } from './Home'

/**
 * WHAT THE COACH SAYS, screen by screen — his ruling, 2026-09-30: "Add tutorial mode, which will
 * be the same as user mode, but everything explain. Everytime you unlock a new feature its
 * explained as well. preferably dynamic explanation."
 *
 * DYNAMIC means built off the state, so every builder here takes what the screen knows and
 * writes the lesson around it: the draft lesson names tonight's opponent and the open spots, the
 * result lesson counts the stars this series banked and says which doors are on the dock, the
 * unlock lesson says what THIS rank of THIS node does and where on which screen it shows up. The
 * selectors (`at`) are the real controls — the coach lights the wheel card, not a picture of one.
 *
 * THE BLINDFOLD HOLDS. The tutorial is user mode with a coach, and user mode's whole point is
 * that nothing tells you whether a pick was good. So no lesson prices a five, calls a matchup or
 * hints at the odds; and where a node buys NUMBERS — the Scout branch, the assignment's price,
 * the pace readout — the lesson says plainly that they stay hidden here and where to read them.
 *
 * Every string is sentence case, in the app's own voice, and never a rating.
 */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const TITLE = (m: CampaignMode) => (m === 'salary' ? 'the Salary cap' : m === 'death' ? 'the Death match' : 'the Campaign')

/** "Utah Jazz 1998", "Bulls all-time" — the way the map and the draft head already name a level. */
export const oppName = (o: Pick<Opponent, 'team' | 'season' | 'tag'>) => (o.season ? `${o.team} ${o.season}` : o.tag ? `${o.team}, ${o.tag}` : o.team)

const BLIND =
  'The tutorial plays blind, exactly like user mode: nothing on any screen says whether a choice was good. Every number is still there in Scout mode — the switch is on the front door.'

/* ---------------------------------------------------------------- the front door */
export function doorLesson(ctx: { team: string | null; cur: number | null; cleared: number; stars: number }): Lesson {
  /* HIS RULING, 2026-09-30: "#1 Should only be welcome and something funny or entertaining. Remove
     #3,4,5,6." So: the welcome, the six marks, and where to start. The counters, the record book
     and the lenses explain themselves when he gets there; `ctx` is kept for the lines that still
     read it. */
  return {
    id: 'door',
    kicker: 'Tutorial · The front door',
    title: 'Welcome to Game 7',
    steps: [
      {
        body: [
          `Welcome${ctx.team ? `, ${ctx.team}` : ''}. Every card in here is a real season, 1980 to 2026, and every night is a best of seven. You draft off a wheel, you call the plan, and you find out.`,
          'Two house rules before you start. One: the wheel does not take requests — it has been asked. Two: there are no bad picks, only picks the other coach liked more.',
          'The coach steps in the first time you reach a screen or unlock something. Next walks a lesson through, Skip closes it, and the ? on every screen brings any lesson back — or resets the tutorial to the top.',
        ],
      },
      {
        at: '.fd-court',
        title: 'Six ways to play',
        body: [
          'Six shirts stand on the floor. The three numbered ones are ladders that bank progress: the Campaign, the Salary cap and the Death match. Custom, Vs friend and 1v1 bid are one-night games — nothing is banked.',
          'Press a shirt to read it.',
        ],
      },
      {
        at: '.fd-cta',
        title: 'Start here',
        body: [
          ctx.cur && ctx.cleared > 0 ? `Level ${ctx.cur} is up next in the Campaign.` : 'The Campaign starts at level 1, and the tutorial keeps its own ladder — the other modes are not touched.',
          'Press the 1 on the floor, then the gold button. The first thing it asks for is your club.',
        ],
      },
    ],
  }
}

/* ---------------------------------------------------------------- the side modes */
export function customLesson(): Lesson {
  return {
    id: 'custom',
    kicker: 'Tutorial · Custom matchup',
    title: 'Any team, any era',
    steps: [
      {
        body: [
          'Pick both fives yourself, from any season between 1980 and 2026. Load a real team on either side, or build one man at a time.',
          'It is a best of seven on the same engine the campaign uses, and nothing is banked — an exhibition.',
        ],
      },
    ],
  }
}
export function versusLesson(): Lesson {
  return {
    id: 'versus',
    kicker: 'Tutorial · Vs friend',
    title: 'Pass the phone',
    steps: [
      {
        body: [
          'Two people, one phone, one shared board of twelve cards. Picks snake — A B B A A B B A A B — so the first pick is not decisive.',
          'Five rings a side, and a man can only be taken into a ring he plays. Either chair may load a whole real team instead of drafting.',
        ],
      },
    ],
  }
}
export function auctionLesson(): Lesson {
  return {
    id: 'auction',
    kicker: 'Tutorial · 1v1 bid',
    title: 'Twenty a head',
    steps: [
      {
        body: [
          'Twenty dollars a chair, and every man goes to the block. Bid a dollar at a time; a pass is final for that lot.',
          'Win him and you choose which of your open rings he fills. A dollar has to stay held for every chair you have not filled.',
        ],
      },
    ],
  }
}

/* ---------------------------------------------------------------- the club */
export function teamLesson(rename: boolean): Lesson {
  return {
    id: rename ? 'team.rename' : 'team',
    kicker: 'Tutorial · Your club',
    title: rename ? 'Rename the club' : 'Name your club',
    steps: [
      {
        body: [
          'One club for all three ladders: a city, a nickname and two colours. Your five wears them on every floor, and every result you bank is in that name.',
          'Tap a city, type the name, pick a kit — or mix your own Main and Trim.',
        ],
      },
      { at: '.dock .btn:not(.ghost)', body: ['Press when the name is set. The map has a Rename door if you change your mind.'] },
    ],
  }
}

/* ---------------------------------------------------------------- the map */
export function mapLesson(ctx: { mode: CampaignMode; level: number | null; opp: Opponent | null; eras: Era[]; bal: number; lives: number }): Lesson {
  const blocks = ctx.eras
    .map((e, i) => `${ROMAN[i]} ${e.name}, levels ${e.first}–${(ctx.eras[i + 1]?.first ?? ROUNDS + 1) - 1}`)
    .join(' · ')
  const first = (CAMPAIGNS as unknown as { name: string; blurb: string }[]).find((t) => t.name === ctx.eras[0]?.name)?.blurb
  const steps: Step[] = [
    {
      at: '.node.now',
      title: ctx.level && ctx.opp ? `Level ${ctx.level} · ${oppName(ctx.opp)}` : 'The ladder',
      body: ctx.level
        ? [
            `The lit ticket is tonight's game — level ${ctx.level} of ${ROUNDS}, against ${ctx.opp ? oppName(ctx.opp) : 'the next team up'}. Press it to draft a five and play a best of seven.`,
            'Every ticket above it is closed until you win the one below. Every ticket you have cleared can be pressed again.',
          ]
        : ['Every rung is cleared. Any ticket can be pressed again for a better star.'],
    },
    {
      title: 'Stars',
      body: [
        'Win and the next rung opens. A win banks stars: one for going the distance, two for a shorter series, three for a sweep.',
        'A loss costs nothing but the attempt — and a cleared level can be replayed for a better star at any time.',
      ],
    },
    {
      at: '.um-eras',
      title: 'Four blocks',
      body: [`${blocks}.`, ...(first ? [`Block I: ${first}`] : []), 'The chips scroll the map to a block — they never move where you are. Each block wears its own look, and the coach says a word when you reach a new one.'],
    },
    {
      at: '.um-staff',
      title: 'Staff',
      body: [
        `Stars buy staff. You have ${plural(ctx.bal, 'star')} to spend. The Staff door opens the tree: every rank costs one star, and every rank widens what you can do — more spins, more reads, a playbook. None adds a point of rating.`,
        'Every rank you buy is explained the moment you buy it.',
      ],
    },
    { at: '.um-rename', title: 'Your club', body: ['The club as it stands. Press to rename it or change the kit.'] },
  ]
  return { id: 'map', kicker: `Tutorial · ${TITLE(ctx.mode)}`, title: `${ROUNDS} rungs`, steps }
}

/**
 * THE LADDER'S OWN RULES, told the first time its map is on the screen. Its own lesson rather than
 * a step on the map's, so a player who learns the map on the Campaign is still told what the cap
 * is the first time he opens the Salary cap.
 */
export function ladderLesson(mode: CampaignMode, lives: number): Lesson | null {
  if (mode === 'salary')
    return {
      id: 'mode.salary',
      kicker: 'Tutorial · The Salary cap',
      title: 'Tight money',
      steps: [
        {
          body: [
            `The same ${ROUNDS} levels, with every card priced at its real salary that season. Your five must come in under 75% of that year's cap, and 5% is held back for each slot you have not filled yet.`,
            'A man you cannot afford is greyed on the wheel, with the reason on his row. The Salary branch of the staff tree buys payroll room.',
          ],
        },
      ],
    }
  if (mode === 'death')
    return {
      id: 'mode.death',
      kicker: 'Tutorial · The Death match',
      title: 'One life',
      steps: [
        {
          body: [
            'One five, carried from the first level to the last. You may change a single man before each level, and no more — in My team, between levels. Every man spends durability per game played; at the floor he must be replaced.',
            `Lose with no life left and the run ends — every star and every node with it. You have ${plural(lives, 'extra life', 'extra lives')} in hand; the Survival branch of the staff tree sells more. It runs on the salary cap too.`,
          ],
        },
      ],
    }
  return null
}

/** The first time there is a star to spend and the map is on the screen. */
export function spendLesson(bal: number): Lesson {
  return {
    id: 'spend',
    kicker: 'Tutorial · Stars',
    title: `${plural(bal, 'star')} to spend`,
    steps: [
      {
        at: '.um-staff',
        body: [
          `You have banked ${plural(bal, 'star')} that nothing has claimed yet. The Staff door takes you to the tree, where a star buys a rank.`,
          'Nothing is lost by waiting — stars keep — but a rank bought now works from the next draft on.',
        ],
      },
    ],
  }
}

/** A new block of the ladder reached. `k` is the block's index, 0-based. */
export function eraLesson(k: number, eras: Era[]): Lesson {
  const e = eras[k]
  const last = (eras[k + 1]?.first ?? ROUNDS + 1) - 1
  const tier = (CAMPAIGNS as unknown as { name: string; blurb: string; years: [number, number] }[]).find((t) => t.name === e.name)
  return {
    id: `era.${k}`,
    kicker: 'Unlocked · A new block',
    title: `Block ${ROMAN[k]} · ${e.name}`,
    steps: [
      {
        body: [
          `You have climbed into block ${ROMAN[k]}: ${e.name}, levels ${e.first} to ${last}${tier ? `, ${tier.years[0]}–${tier.years[1]}` : ''}.`,
          ...(tier ? [tier.blurb] : []),
          'The map, the draft and the staff room wear this block’s look from here. The rules are the ones you know: a best of seven a rung, stars for a win.',
        ],
      },
    ],
  }
}

/* ---------------------------------------------------------------- the draft */
export function draftLesson(ctx: {
  level: number
  opp: Opponent
  salary: boolean
  death: boolean
  carry: boolean
  spins: number
  changeLeft: boolean
  hasBoard: boolean
  hasPlan: boolean
  tips: boolean
}): Lesson {
  const steps: Step[] = [
    {
      at: '.col.a',
      title: `Level ${ctx.level} · ${oppName(ctx.opp)}`,
      body: [
        `Tonight's opponent: ${oppName(ctx.opp)}${ctx.opp.record ? `, ${ctx.opp.record} that season` : ''}. Their five is listed here, PG to C. Tap a man to read his season line.`,
        ...(ctx.opp.champion ? ['They won the title that year.'] : []),
      ],
    },
  ]
  if (ctx.carry) {
    steps.push({
      at: '.col.c',
      title: 'Your carried five',
      body: [
        'The Death match carries one five the whole way, so your men are already on the floor, each with the durability he has left. At the floor he must be replaced, in My team.',
        ctx.changeLeft ? 'You have a change left before this level — it is made in My team, off the map. Or go straight in.' : 'Your change for this level is spent — take the floor.',
      ],
    })
    if (ctx.tips) steps.push({ at: '.tips-door', title: 'Coaching tips', body: ['The i opens three things your coach says about this matchup, read off both fives. No numbers, no verdict.'] })
    if (ctx.hasBoard || ctx.hasPlan)
      steps.push({
        at: '.staffbar',
        title: 'Your staff doors',
        body: [[ctx.hasBoard ? 'Matchup board: assign every defender yourself.' : '', ctx.hasPlan ? 'Playbook: the plan, as called in My team.' : ''].filter(Boolean).join(' ')],
      })
    steps.push({ at: '.dock .btn', body: ['Take the floor plays the best of seven. Every man who plays spends one durability per game.'] })
    return { id: 'draft.carry', kicker: 'Tutorial · The draft', title: 'Your five is with you', steps }
  }
  steps.push(
    {
      at: '.col.b',
      title: 'The wheel',
      body: [
        'Each spin lands on a franchise and a season, and you draft one man from that roster. Five spins, five men — one for each spot: PG, SG, SF, PF, C.',
        'What the wheel gives you is the game: you build a five from what lands, not from a menu.',
      ],
    },
    {
      at: '.col.c',
      title: 'Your floor',
      body: ['The five you draft stand here on their spots. A drafted man can be dragged from his ring to another he can play.'],
    },
  )
  if (ctx.salary)
    steps.push({
      title: 'Under the cap',
      body: [
        'Every card is priced at its real salary that season, and the five must fit under 75% of the cap. A man you cannot afford is greyed, with the reason on his row, and 5% is held back for each empty spot.',
      ],
    })
  if (ctx.spins > 0)
    steps.push({
      title: 'Extra spin',
      body: [`You own Extra spin: ${plural(ctx.spins, 'respin')} a draft. Once the wheel lands, a Respin team chip stands on the wheel card's head while charges last.`],
    })
  steps.push({ at: '.dock .btn', body: ['Spin the wheel to begin.'] })
  return { id: 'draft.spin', kicker: 'Tutorial · The draft', title: 'Draft a five', steps }
}

export function landedLesson(ctx: { team: string; year: number | string; open: string[]; respins: number; seasonRespins: number }): Lesson {
  const steps: Step[] = [
    {
      at: '.col.b .spin-roster',
      body: [
        `The wheel stopped on the ${ctx.year} ${ctx.team}. This is their roster; the spots still open on your floor are ${ctx.open.join(', ')}.`,
        'Tap a man to read him, or press and hold and drag him onto an open spot on the court.',
      ],
    },
    {
      at: '.dock .btn',
      title: 'Confirm the pick',
      body: [
        'Pick a man and a spot, and the dock button says it: Draft him at PG. One man per five — another season of a man you already hold is still him, so he is greyed.',
        'If a roster has nobody for your open spots, spin again; the wheel counts the spins you have taken.',
      ],
    },
  ]
  if (ctx.respins > 0) steps.push({ at: '.chip-btn', title: 'Respin team', body: [`You have ${plural(ctx.respins, 'respin')} left this draft. Respin team rerolls the whole landing.`] })
  if (ctx.seasonRespins > 0)
    steps.push({
      title: 'Version respin',
      body: [`You own Version respin: ${plural(ctx.seasonRespins, 'reroll')} a draft. On a drafted man's row, Another season swaps him for a different year of the same man.`],
    })
  return { id: 'draft.landed', kicker: 'Tutorial · The wheel landed', title: `${ctx.team} ${ctx.year}`, steps }
}

export function fullLesson(ctx: { five: string[]; opp: Opponent; hasBoard: boolean; hasPlan: boolean; tips: boolean }): Lesson {
  const steps: Step[] = [
    {
      at: '.tipoff',
      title: 'The tip-off',
      body: [`Both fives, in club colours, PG to C: ${ctx.five.join(', ')} across from ${oppName(ctx.opp)}. Each man stands opposite the man he picks up.`],
    },
  ]
  if (ctx.tips)
    steps.push({
      at: '.tips-door',
      title: 'Coaching tips',
      body: [
        'The i opens three things your coach says about this matchup, read off both fives: who to play through, who has their best man, and where the glass stands.',
        'Sentences a coach would say in a huddle — no numbers, no verdict.',
      ],
    })
  if (ctx.hasBoard || ctx.hasPlan)
    steps.push({
      at: '.staffbar',
      title: 'Your staff doors',
      body: [
        [ctx.hasBoard ? 'Matchup board: assign every defender yourself.' : '', ctx.hasPlan ? 'Playbook: call the plan for this five.' : ''].filter(Boolean).join(' '),
        'Both open once the five is in, because both are questions about the personnel.',
      ],
    })
  steps.push({
    at: '.dock .btn',
    title: 'Take the floor',
    body: ['The ball goes up and the series is played, best of seven. The games land one at a time; the result screen explains what the night was worth.'],
  })
  return { id: 'draft.full', kicker: 'Tutorial · Five in', title: 'Your five is set', steps }
}

export function planLesson(rank: number, death: boolean): Lesson {
  const steps: Step[] = [
    {
      at: '.playcalls',
      title: 'The plan',
      body: [
        'Who the offense runs through — the main scorer — and whose hands the ball is in, the main playmaker. And the tempo: fast means more possessions and a noisier night for both teams, slow the reverse.',
        'The names are read against the five that actually plays. A man who is not out there is simply not heard.',
      ],
    },
  ]
  if (rank >= 2) steps.push({ title: 'The style and the glass', body: ['Rank 2: the shot diet — a style the five plays — and whether to crash the glass. Balanced is the free default; forcing a style the roster cannot run hurts.'] })
  if (rank >= 3) steps.push({ title: 'The defense', body: ['Rank 3: the defensive scheme, and hunting the mismatch. Matchup is the free default.'] })
  steps.push({
    body: [
      death ? 'In the Death match the plan is called in My team, between levels, and carried to every night.' : 'The plan persists: it is how this franchise plays, and it is re-read against every new five.',
      BLIND,
    ],
  })
  return { id: 'plan', kicker: 'Tutorial · The playbook', title: `Playbook · rank ${rank}`, steps }
}

export function boardLesson(canSolve: boolean): Lesson {
  return {
    id: 'board',
    kicker: 'Tutorial · The matchup board',
    title: 'Who picks up whom',
    steps: [
      {
        at: '.mboard',
        body: [
          'Every one of their men on the left, and a ring beside him for the man of yours who guards him. Drag a defender onto a man; every man needs one.',
          canSolve ? 'Solve fills the whole board the way the engine would, for you to tweak.' : 'Rank 2 of the node adds Solve, which fills the board for you.',
          BLIND,
        ],
      },
    ],
  }
}

/* ---------------------------------------------------------------- the result */
export function resultLesson(ctx: { won: boolean; wins: number; losses: number; games: number; stars: number; next: boolean; rematch: boolean; death: boolean }): Lesson {
  const doors: string[] = []
  if (ctx.next) doors.push('Next level goes straight into the next draft')
  if (ctx.rematch) doors.push(`Rematch plays this level again on a fresh wheel${ctx.won ? ', for a better star' : ''}`)
  doors.push('Back to the map settles the night and returns to the ladder')
  const rule = ctx.stars === 3 ? 'a sweep is worth three' : ctx.stars === 2 ? 'a series won short of seven is worth two' : 'going the distance is worth one'
  const steps: Step[] = [
    {
      at: '.verdict',
      title: ctx.won ? `You won it ${ctx.wins}–${ctx.losses}` : `They took it ${ctx.losses}–${ctx.wins}`,
      body: [
        `The series line, and the ${plural(ctx.games, 'game')} under it as a strip. Press any game for its box score — and the cards below read the series as a whole.`,
      ],
    },
    {
      title: ctx.won ? `${plural(ctx.stars, 'star')} banked` : 'Nothing banked',
      body: ctx.won
        ? [`That banks ${plural(ctx.stars, 'star')}: ${rule}. Stars are spent on staff, off the map. A level keeps its best star, so a rematch can only improve it.`]
        : ['No stars tonight, and nothing lost but the attempt. The wheel reseeds every time, so a rematch is a different draft.', ...(ctx.death ? ['In the Death match a loss costs a life, and with none left it ends the run.'] : [])],
    },
    { at: '.dock', title: 'The doors', body: [`${doors.join('. ')}.`] },
  ]
  if (ctx.death) steps.push({ title: 'Wear', body: [`Every man who played lost one durability per game — ${ctx.games} tonight. My team is where you read it and change a man.`] })
  return { id: ctx.won ? 'result.win' : 'result.loss', kicker: 'Tutorial · The result', title: ctx.won ? 'A win' : 'A loss', steps }
}

/* ---------------------------------------------------------------- the staff tree */
export function staffLesson(ctx: { bal: number; earned: number; branches: Branch[] }): Lesson {
  const names: Record<Branch, string> = {
    Scout: 'Scout — know more before you draft',
    'Front office': 'Front office — more chances on the wheel',
    Coach: 'Coach — assignments, pace and the playbook',
    Salary: 'Salary — payroll room',
    Survival: 'Survival — lives, checkpoints and substitutions',
  }
  return {
    id: 'staff',
    kicker: 'Tutorial · The staff tree',
    title: 'Stars into staff',
    steps: [
      {
        at: '.map-total',
        body: [`${ctx.bal} to spend of ${ctx.earned} earned. Every rank costs one star. No node adds a point of rating — each widens what you can do.`],
      },
      {
        at: '.treesvg',
        title: `${ctx.branches.length} branches`,
        body: [ctx.branches.map((b) => names[b]).join('. ') + '.', 'A branch is a chain: one rank in a node opens the node below it, so a branch can be walked wide or deep.'],
      },
      {
        at: '.treenode',
        title: 'A node',
        body: ['Tap a hexagon for its ranks. The sheet says what each rank buys, and the gold button takes one star for the next one. The coach explains every rank the moment it is bought.'],
      },
      { body: ['Reset spending refunds every star and unlearns every node, if you change your mind about a branch.'] },
    ],
  }
}

/**
 * A RANK BOUGHT. What the rank does, then WHERE it shows up — and, for the nodes that buy numbers,
 * the plain fact that the tutorial does not print them.
 */
const WHERE: Record<NodeId, (r: number) => string[]> = {
  scout_ratings: (r) => [
    `On the draft, in the opponent's column: ${['their card shows exact axis numbers', 'their five break out into rows, man by man', 'any of their men opens his full attribute sheet on the card'][r - 1]}.`,
    `This node buys ratings, and ${BLIND.charAt(0).toLowerCase()}${BLIND.slice(1)}`,
  ],
  scout_reads: (r) => [
    `${['Their hunt orientation, steal target and where their anchor hides', 'Their defensive board against your five — who picks up whom'][r - 1]}: a read on what they will try to do to you, before you draft.`,
    `These are scout reads, and ${BLIND.charAt(0).toLowerCase()}${BLIND.slice(1)}`,
  ],
  scout_wheel: (r) => [
    r === 1 ? 'On the draft, the wheel card names the next landing before you spin.' : 'And the wheel card shows the roster the next landing brings — the men you would be choosing from.',
  ],
  fo_spin: (r) => [`On the draft, once the wheel lands: a Respin team chip on the wheel card's head. ${plural(r, 'respin')} a draft, and the count resets every draft.`],
  fo_respin: (r) => [`On the draft, on a drafted man's row: Another season swaps him for a different year of the same man, still eligible for his spot. ${plural(r, 'reroll')} a draft.`],
  fo_decade: (r) => [
    r === 1 ? "On the draft, under the wheel: a Decade toggle opens every man who wore the shirt in that landing's decade." : 'The Decade toggle now reaches the decade either side as well — thirty years of the franchise.',
  ],
  fo_division: (r) => [r === 1 ? "On the draft, under the wheel: a Division toggle opens that season's whole division." : "The toggle now opens that season's entire conference."],
  coach_optimal: (r) => [
    r === 1
      ? 'On every night from here: your defensive assignments go from naive to optimal — the anchor hides on their worst shooter, the rest sort themselves. Nothing to press; it is how your five defends now.'
      : 'Rank 2 prices the assignment on the draft, in points of spread.',
    ...(r === 2 ? [`That price is a number, and ${BLIND.charAt(0).toLowerCase()}${BLIND.slice(1)}`] : []),
  ],
  coach_manual: (r) => [
    r === 1
      ? 'On the draft, once the five is in: a Matchup board door. Drag a defender onto each of their men; the board you set is the board the night plays.'
      : 'On the board: a Solve button fills the whole thing the way the engine would, for you to tweak.',
  ],
  coach_sigma: (r) => [
    ['On the draft, a pace readout: both surpluses, so the tempo call reads the matchup.', 'A trained bench wastes less: the tempo deviation tax is halved, every night.', 'Your call carries the night: 85% of the pace is yours, however they answer.'][r - 1],
    ...(r === 1 ? [`The readout is numbers, and ${BLIND.charAt(0).toLowerCase()}${BLIND.slice(1)}`] : []),
  ],
  coach_tactics: (r) => [
    `On the draft, once the five is in: a Playbook door${r === 1 ? ' — new with this rank' : ''}. In the Death match the same calls are made in My team. ${['Name your main scorer and main playmaker, and set the tempo.', 'The shot diet — a style — and crashing the glass.', 'The defensive scheme, and hunting the mismatch.'][r - 1]}`,
    'The plan persists and is re-read against every five that plays; a named man who is not on the floor is not heard.',
  ],
  cap: (r) => [`The Salary cap: your payroll ceiling is ${5 * r}% higher from the next draft. The cap line on the draft head reads the new room.`],
  surv_life: (r) => [`The Death match: ${plural(r, 'loss')} absorbed before the run ends. The map's head counts the lives in hand.`],
  surv_save: (r) => [`The Death match: a lost run restarts at level ${[20, 40, 60][r - 1]} rather than at one. Everything below that rung can no longer be taken from you.`],
  surv_sub: (r) => [`The Death match: ${r + 1} changes before each level rather than one, in My team.`],
  surv_dura: (r) => [`The Death match: every man on the five carries +${10 * r} durability, read on every card from now — the current five too.`],
  surv_bench: (r) => [
    r === 1
      ? 'The Death match: a sixth roster spot in My team. He does not play, so he takes no wear — and he recovers 3 durability every settled series, never past his own card. Rest a floor man there for free.'
      : 'The bench man recovers 6 a series now — a real rotation, one man at a time.',
  ],
}

export function unlockLesson(id: NodeId, r: number): Lesson {
  const n = NODE[id]
  const steps: Step[] = [
    { body: [n.blurb, `Rank ${r}: ${n.rankBlurbs[r - 1]}`] },
    { title: 'Where it shows up', body: WHERE[id](r) },
  ]
  if (r < n.ranks) steps.push({ title: `Rank ${r + 1}`, body: [`One more star would add: ${n.rankBlurbs[r]}`] })
  else steps.push({ body: [`${n.name} is maxed.`] })
  return { id: `unlock.${id}.${r}`, kicker: `Unlocked · ${n.branch}`, title: `${n.name} · rank ${r} of ${n.ranks}`, steps }
}

/* ---------------------------------------------------------------- the death match */
export function myTeamLesson(ctx: { five: { name: string; left: number }[]; allowed: number; used: number; bench: string | null; heal: number; floor: number }): Lesson {
  const worn = ctx.five.filter((p) => p.left <= ctx.floor).map((p) => p.name)
  const steps: Step[] = [
    {
      at: '.col.a',
      title: 'Your five and their wear',
      body: [
        `The five you carry, with the durability each has left: ${ctx.five.map((p) => `${p.name} ${p.left}`).join(', ')}. Every game played costs one; at ${ctx.floor} or less a man is worn out and cannot take the floor.`,
        worn.length ? `${worn.join(' and ')} ${worn.length === 1 ? 'is' : 'are'} worn out — replace ${worn.length === 1 ? 'him' : 'them'} before the next level.` : 'Nobody is worn out tonight.',
      ],
    },
    {
      at: '.col.c',
      title: 'One change',
      body: [
        `You may change ${plural(ctx.allowed, 'man', 'men')} before each level — ${ctx.allowed - ctx.used} left this round. Spin the wheel, pick the man coming in and the man going out. The change is spent when the series settles.`,
        'Drag a man from one ring to another he can play; that costs nothing.',
      ],
    },
  ]
  if (ctx.heal > 0)
    steps.push({
      title: 'The bench',
      body: [
        ctx.bench
          ? `${ctx.bench} is resting on the bench. He plays nothing, takes no wear, and recovers ${ctx.heal} durability every settled series — never past his own card. Rest a floor man there for free.`
          : `The bench is open: sign a sixth man to it. He plays nothing and recovers ${ctx.heal} durability a series. Swapping a floor man onto it costs nothing.`,
      ],
    })
  steps.push({ body: ['The Playbook is called here in the Death match, and carried to every night.'] })
  return { id: 'myteam', kicker: 'Tutorial · My team', title: 'The five you carry', steps }
}

export function lifeLesson(livesLeft: number): Lesson {
  return {
    id: 'death.life',
    kicker: 'Tutorial · The Death match',
    title: 'A life spent',
    steps: [{ body: [`That loss cost a life; the run goes on with ${plural(livesLeft, 'life', 'lives')} left. Extra lives come from the Survival branch of the staff tree.`] }],
  }
}
export function runOverLesson(): Lesson {
  return {
    id: 'death.over',
    kicker: 'Tutorial · The Death match',
    title: 'The run is over',
    steps: [
      {
        body: [
          'A loss with no life left ends the run: every star, every node and the five go with it, and the ladder starts again at one. The Survival branch of the staff tree sells extra lives — the first star of the next run is well spent there.',
        ],
      },
    ],
  }
}

/* ---------------------------------------------------------------- the trophy case */
export function trophyLesson(d: AchDef): Lesson {
  return {
    id: 'trophy',
    kicker: 'Tutorial · Trophies',
    title: 'Your first achievement',
    steps: [
      {
        body: [
          `That toast was an achievement: ${d.name}, in the ${d.tier} tier. There are dozens — for sweeps, for streaks, for the men you draft — and the Trophies room on the front door keeps every one, with the night it was won.`,
        ],
      },
    ],
  }
}
