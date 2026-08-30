import { DEFAULT_ORDER, PLAYERS } from '../engine/pool'
import { ROUNDS } from '../config'
import { currentLevel, type CampaignMode, type Progress } from '../state/campaign'
import { setUserMode, useUserMode } from '../state/viewmode'
import { achCount } from '../state/achievements'

export type Mode = CampaignMode | 'database' | 'archetypes' | 'versus' | 'custom' | 'achievements'

export interface Era {
  name: string
  years: [number, number]
  handicap: number
  first: number
}

/**
 * The front door, set like a front page (design 2a): masthead, a slate of
 * numbered ledger rows for the campaigns, and the record book below the fold.
 */
export function Home({ progress, onPick }: { progress: Record<CampaignMode, Progress>; onPick: (m: Mode) => void }) {
  const user = useUserMode()
  const tally = (p: Progress) => {
    const n = p.stars.reduce((a, b) => a + b, 0)
    return n > 0 ? `★ ${n} / ${ROUNDS * 3}` : null
  }
  const cur = currentLevel(progress.campaign)
  return (
    <>
      <div className="mast">
        <span>A basketball draft roguelike</span>
        <i>1980–2026</i>
      </div>
      <div className="hero front">
        <h1>
          GAME<em>7</em>
        </h1>
        <p>
          Draft a five off the wheel.
          <br />
          Best of seven against every team in the league.
        </p>
        <button className="sortb" onClick={() => setUserMode(!user)} style={{ marginTop: 10 }}>
          {user ? 'USER MODE — the numbers are hidden. Tap for scout mode' : 'SCOUT MODE — every number shows. Tap for user mode'}
        </button>
        <div className="rule2" style={{ margin: '22px 0 0' }} />
      </div>

      <div className="section-rule">
        <span>Tonight's slate</span>
        <i />
      </div>

      <button className="slate-row" onClick={() => onPick('campaign')}>
        <div className="slate-top">
          <span className="slate-name">
            <span className="slate-n">01</span>
            <b>Campaign</b>
          </span>
          <em className="slate-tag">{tally(progress.campaign) ?? 'PLAY →'}</em>
        </div>
        <div className="ladder slate-ladder">
          {Array.from({ length: ROUNDS }, (_, i) => (
            <span key={i} className={`rung ${progress.campaign.stars[i] > 0 ? 'done' : i + 1 === cur ? 'now' : ''}`} />
          ))}
        </div>
        <span className="slate-status">{cur ? `Level ${cur} is up` : 'All cleared'}</span>
      </button>

      <button className="slate-row" onClick={() => onPick('salary')}>
        <div className="slate-top">
          <span className="slate-name">
            <span className="slate-n">02</span>
            <b>Salary Cap Campaign</b>
          </span>
          <em className="slate-tag">{tally(progress.salary) ?? 'PLAY →'}</em>
        </div>
        <span className="slate-sub">The same {ROUNDS} levels — every card priced that year, the five held under the cap.</span>
      </button>

      <button className="slate-row" onClick={() => onPick('death')}>
        <div className="slate-top">
          <span className="slate-name">
            <span className="slate-n">03</span>
            <b>Death Match Campaign</b>
          </span>
          <em className="slate-tag danger">{tally(progress.death) ?? 'ONE LIFE'}</em>
        </div>
        <span className="slate-sub">One five, carried the whole way — change a single man before each level. Lose and the run is over.</span>
      </button>

      <div className="slate-grid">
        <button className="slate-row half" onClick={() => onPick('custom')}>
          <b className="them">Custom matchup</b>
          <em>ANY ERA · PLAY →</em>
        </button>
        <button className="slate-row half" onClick={() => onPick('versus')}>
          <b className="them">Player vs Friend</b>
          <em>SAME PHONE · PLAY →</em>
        </button>
      </div>

      {user ? null : (
        <>
          <div className="section-rule">
            <span>The record book</span>
            <i />
          </div>
          <div className="slate-grid book">
            <button className="slate-row half" onClick={() => onPick('database')}>
              <b>Database</b>
              <em>{PLAYERS.length.toLocaleString()} MEN · BROWSE →</em>
            </button>
            <button className="slate-row half" onClick={() => onPick('archetypes')}>
              <b>Archetypes</b>
              <em>{DEFAULT_ORDER.length} TAGS →</em>
            </button>
            <button className="slate-row half" onClick={() => onPick('achievements')}>
              <b>Achievements</b>
              <em>
                {achCount().done} OF {achCount().total} →
              </em>
            </button>
          </div>
        </>
      )}

      <div className="alltime">Every number from real 1980–2026 stats</div>
    </>
  )
}
