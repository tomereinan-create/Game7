import { DEFAULT_ORDER, PLAYERS } from '../engine/pool'
import { ROUNDS } from '../config'
import { currentLevel, type CampaignMode, type Progress } from '../state/campaign'
import { setUserMode, useUserMode } from '../state/viewmode'
import { achCount } from '../state/achievements'
import { useLayout } from './useLayout'
import { Ball } from './Ball'

export type Mode = CampaignMode | 'database' | 'archetypes' | 'versus' | 'auction' | 'custom' | 'achievements' | 'teams'

export interface Era {
  name: string
  years: [number, number]
  first: number
}

/**
 * The front door (Game7 Flow, screen 1): the dribbling mark against the wordmark, the mode
 * question, then tonight's slate — one lit blue card for the campaign carrying the whole
 * 150-rung ladder, two quiet rules under it, the three side modes, and the record book, which
 * belongs to Scout mode only.
 */
export function Home({ progress, onPick }: { progress: Record<CampaignMode, Progress>; onPick: (m: Mode) => void }) {
  const user = useUserMode()
  const tally = (p: Progress) => {
    const n = p.stars.reduce((a, b) => a + b, 0)
    return n > 0 ? `★ ${n} / ${ROUNDS * 3}` : null
  }
  const cur = currentLevel(progress.campaign)
  /**
   * THE LADDER, FOR ANY OF THE THREE (his ruling: "Have all the campaigns show the progress in
   * their bar"). It used to be printed on the campaign card alone, so the two rules under it named
   * a star total with nothing to read it against — 32 of 450 says how many, never how far. Each
   * mode keeps its own save, so each one gets its own 150 rungs off its own progress.
   */
  const rungs = (p: Progress) => {
    const at = currentLevel(p)
    return (
      <div className="ladder slate-ladder">
        {Array.from({ length: ROUNDS }, (_, i) => (
          <span key={i} className={`rung ${p.stars[i] > 0 ? 'done' : i + 1 === at ? 'now' : ''}`} />
        ))}
      </div>
    )
  }
  /**
   * THE FRONT DOOR IS ITS OWN ROOM — stated as a body class for the same reason the draft, My
   * team and the map state theirs: this screen is a fragment with no wrapper of its own, and the
   * skin has to reach the page's own ground and the crowd lights above it, both of which sit
   * outside anything Home renders. It comes off on the way out.
   */
  useLayout(() => {
    document.body.classList.add('tunnel')
    return () => document.body.classList.remove('tunnel')
  }, [])
  return (
    <>
      {/* The hero: the mark dribbles beside the wordmark, the years sit under it, and two
          flashbulbs go off in the dark behind — the crowd is already in. */}
      <div className="hero front">
        <span className="flashbulb one" aria-hidden />
        <span className="flashbulb two" aria-hidden />
        <Ball size={62} dribble />
        <div className="lockup">
          <h1>
            GAME<em>7</em>
          </h1>
          <i className="years">1980—2026</i>
        </div>
      </div>
      <p className="hero-lede">
        Draft a five off the wheel.
        <br />
        Best of seven against every team in the league.
      </p>

      {/* His ruling: two options, plainly. The old control was a single button whose label
          carried both the state and the action ("USER MODE — ... Tap for scout mode"), so
          which half you were reading was a guess. Now the choice is the shape on screen. */}
      <div className="modepick">
        <div className="mode-cap">How do you want to see the game?</div>
        <div className="mode-row">
          <button className={`mode-opt ${user ? 'on' : ''}`} onClick={() => setUserMode(true)} aria-pressed={user}>
            <b>User mode</b>
            <i>Play blind. No ratings, no verdict.</i>
          </button>
          <button className={`mode-opt ${user ? '' : 'on'}`} onClick={() => setUserMode(false)} aria-pressed={!user}>
            <b>Scout mode</b>
            <i>Every number shows — fits and odds.</i>
          </button>
        </div>
      </div>

      <div className="section-rule">
        <span>Tonight's slate</span>
        <i />
      </div>

      {/* 01 CAMPAIGN is the lit card — franchise blue inside a gold border, the whole 150-rung
          ladder printed across it, and the only Play chip on the screen. */}
      <button className="slate-card" onClick={() => onPick('campaign')}>
        <div className="slate-top">
          <span className="slate-n">01</span>
          <b>Campaign</b>
          <em className="slate-tag">{tally(progress.campaign) ?? 'PLAY →'}</em>
        </div>
        {rungs(progress.campaign)}
        <div className="slate-foot">
          <span className="slate-status">{cur ? `Level ${cur} is up` : 'All cleared'}</span>
          <span className="chip-gold">Play →</span>
        </div>
      </button>

      {/* 02 and 03 carry the same ladder the campaign card does. The row is a column now — the
          names on one line, the 150 rungs under them — so the star count above has something to
          be read against. */}
      <div className="slate-main">
        <button className="slate-row" onClick={() => onPick('salary')}>
          <span className="slate-top">
            <span className="slate-n">02</span>
            <b>Salary cap</b>
            <em className="slate-tag">{tally(progress.salary) ?? 'Under the cap →'}</em>
          </span>
          {rungs(progress.salary)}
        </button>
        <button className="slate-row death" onClick={() => onPick('death')}>
          <span className="slate-top">
            <span className="slate-n">03</span>
            <b>Death match</b>
            <em className="slate-tag danger">{tally(progress.death) ?? 'One life →'}</em>
          </span>
          {rungs(progress.death)}
        </button>
      </div>

      <div className="slate-grid side">
        <button className="side-mode" onClick={() => onPick('custom')}>
          <b>Custom</b>
          <em>Any era</em>
        </button>
        <button className="side-mode" onClick={() => onPick('versus')}>
          <b>vs Friend</b>
          <em>Same phone</em>
        </button>
        <button className="side-mode" onClick={() => onPick('auction')}>
          <b>1v1 Bid</b>
          <em>$20 each</em>
        </button>
      </div>

      {user ? null : (
        <div className="slate-grid book">
          <button className="book-row" onClick={() => onPick('database')}>
            <b>Database</b>
            <em>{PLAYERS.length.toLocaleString()} →</em>
          </button>
          <button className="book-row" onClick={() => onPick('archetypes')}>
            <b>Archetypes</b>
            <em>{DEFAULT_ORDER.length} →</em>
          </button>
          <button className="book-row" onClick={() => onPick('teams')}>
            <b>Teams</b>
            <em>Every season →</em>
          </button>
          <button className="book-row" onClick={() => onPick('achievements')}>
            <b>Trophies</b>
            <em>
              {achCount().done} of {achCount().total} →
            </em>
          </button>
        </div>
      )}

      <div className="alltime">Every number from real 1980—2026 stats</div>
    </>
  )
}
