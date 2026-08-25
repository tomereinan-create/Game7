import { PLAYERS } from '../engine/pool'
import { ROUNDS } from '../config'
import type { CampaignMode, Progress } from '../state/campaign'

export type Mode = CampaignMode | 'database' | 'archetypes' | 'versus' | 'custom'

export interface Era {
  name: string
  years: [number, number]
  handicap: number
  first: number
}

/** The front door: the campaign, its salary variant, versus, the database. */
export function Home({ progress, onPick }: { progress: Record<CampaignMode, Progress>; onPick: (m: Mode) => void }) {
  const tally = (p: Progress) => {
    const n = p.stars.reduce((a, b) => a + b, 0)
    return n > 0 ? `★ ${n} / ${ROUNDS * 3}` : 'PLAY →'
  }
  return (
    <>
      <div className="hero">
        <div className="kicker">A basketball draft roguelike</div>
        <h1>
          GAME<em>7</em>
        </h1>
        <p>Draft a five off the wheel. Best of seven against every team in the league.</p>
        <div className="rule2" />
      </div>

      <button className="mode you" onClick={() => onPick('campaign')}>
        <div className="bar" />
        <div className="in">
          <div style={{ minWidth: 0 }}>
            <b>Campaign</b>
          </div>
          <em>{tally(progress.campaign)}</em>
        </div>
      </button>

      <button className="mode you" onClick={() => onPick('salary')}>
        <div className="bar" />
        <div className="in">
          <div style={{ minWidth: 0 }}>
            <b>Salary Cap Campaign</b>
            <span>The same {ROUNDS} levels, with every player's salary that year and his share of the league cap on the card.</span>
          </div>
          <em>{tally(progress.salary)}</em>
        </div>
      </button>

      <button className="mode you" onClick={() => onPick('death')}>
        <div className="bar" />
        <div className="in">
          <div style={{ minWidth: 0 }}>
            <b>Death Match Campaign</b>
            <span>
              The salary cap campaign with your life on it. One five, carried the whole way — change a single man before
              each level. Lose and the run is over: no five, and every level past your checkpoint gone. The Survival branch
              sells the only mercy there is.
            </span>
          </div>
          <em>{tally(progress.death)}</em>
        </div>
      </button>

      <button className="mode them" onClick={() => onPick('custom')}>
        <div className="bar" />
        <div className="in">
          <div style={{ minWidth: 0 }}>
            <b>Custom matchup</b>
            <span>Build two fives by hand out of the whole database — any era — and play the series.</span>
          </div>
          <em>PLAY →</em>
        </div>
      </button>

      <button className="mode them" onClick={() => onPick('versus')}>
        <div className="bar" />
        <div className="in">
          <div style={{ minWidth: 0 }}>
            <b>Player vs Friend</b>
            <span>Same phone. Draft in turns from one pool, then sim the series.</span>
          </div>
          <em>PLAY →</em>
        </div>
      </button>

      <button className="mode" onClick={() => onPick('database')}>
        <div className="bar" />
        <div className="in">
          <div style={{ minWidth: 0 }}>
            <b>Database</b>
            <span>{PLAYERS.length.toLocaleString()} player-seasons, 1980–2026. Every rating from real stats.</span>
          </div>
          <em>BROWSE →</em>
        </div>
      </button>

      <button className="mode" onClick={() => onPick('archetypes')}>
        <div className="bar" />
        <div className="in">
          <div style={{ minWidth: 0 }}>
            <b>Archetypes</b>
            <span>Every tag the tree hands out, what it means, and every man who wears it.</span>
          </div>
          <em>44 TAGS →</em>
        </div>
      </button>
    </>
  )
}
