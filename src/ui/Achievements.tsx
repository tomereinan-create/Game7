import { ACHIEVEMENTS, achState, type AchDef, type AchTier } from '../state/achievements'

const TIERS: { key: AchTier; label: string }[] = [
  { key: 'common', label: 'Common' },
  { key: 'rare', label: 'Rare' },
  { key: 'legendary', label: 'Legendary' },
]

const when = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function Row({ a, got }: { a: AchDef; got: { date: string; campaign: string } | undefined }) {
  // A hidden achievement reveals only on unlock: until then it is a sealed line.
  const sealed = a.hidden && !got
  return (
    <div className={`ach-row ${got ? 'got' : ''}`}>
      <span className="ach-mark">{got ? '★' : '☆'}</span>
      <span className="ach-who">
        <b>{sealed ? '? ? ?' : a.name}</b>
        <i>{sealed ? 'Unlocks in silence.' : a.desc}</i>
        {got ? (
          <em>
            {when(got.date)} · {got.campaign}
          </em>
        ) : null}
      </span>
      <span className={`ach-tier ${a.tier}`}>{a.tier.toUpperCase()}</span>
    </div>
  )
}

/** The trophy case: 57 lines in the record book's voice, x/57 on the masthead. */
export function Achievements({ onBack }: { onBack: () => void }) {
  const s = achState()
  const done = Object.keys(s.unlocked).length
  return (
    <div className="sheetcard">
      <div className="topbar">
        <span>Achievements</span>
        <button onClick={onBack}>← Back</button>
      </div>
      <div className="rule2" />
      <div className="map-head">
        <div>
          <div className="map-kicker">The trophy case</div>
          <div className="map-total">
            {done}
            <i> / {ACHIEVEMENTS.length}</i>
          </div>
        </div>
        <div className="map-side">
          <div className="map-kicker">
            {TIERS.map((t) => `${ACHIEVEMENTS.filter((a) => a.tier === t.key && s.unlocked[a.id]).length}/${ACHIEVEMENTS.filter((a) => a.tier === t.key).length} ${t.label.toLowerCase()}`).join(' · ')}
          </div>
        </div>
      </div>
      {TIERS.map((t) => (
        <section key={t.key}>
          <div className="section-rule">
            <span>{t.label}</span>
            <i />
          </div>
          {ACHIEVEMENTS.filter((a) => a.tier === t.key).map((a) => (
            <Row key={a.id} a={a} got={s.unlocked[a.id]} />
          ))}
        </section>
      ))}
      <div className="alltime">Every unlock reads from a real series</div>
    </div>
  )
}
