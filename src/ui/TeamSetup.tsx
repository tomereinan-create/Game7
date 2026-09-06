import { useEffect, useMemo, useState } from 'react'
import type { Team } from '../state/campaign'
import { useTicker } from './Ticker'

/** [name, ISO country code, population], sorted by population desc (GeoNames cities15000). */
type City = [string, string, number]

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const countryName = (() => {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' })
    return (c: string) => dn.of(c) ?? c
  } catch {
    return (c: string) => c
  }
})()

/**
 * Name your team: any city in the world (34,000 of them, population 15,000
 * and up) plus a nickname. The first screen of a campaign, and again from the
 * map if you want to rename.
 */
export function TeamSetup({
  title,
  initial,
  onDone,
  onBack,
}: {
  title: string
  initial: Team | null
  onDone: (t: Team) => void
  onBack: () => void
}) {
  const [cities, setCities] = useState<City[] | null>(null)
  const [q, setQ] = useState(initial?.city ?? '')
  const [city, setCity] = useState<Team | null>(initial)
  const [name, setName] = useState(initial?.name ?? '')

  useEffect(() => {
    let on = true
    fetch('cities.json')
      .then((r) => r.json())
      .then((d: City[]) => on && setCities(d))
      .catch(() => on && setCities([]))
    return () => {
      on = false
    }
  }, [])

  const hits = useMemo(() => {
    if (!cities || !q.trim() || (city && q === city.city)) return []
    const f = fold(q.trim())
    const starts: City[] = []
    const within: City[] = []
    for (const c of cities) {
      const n = fold(c[0])
      if (n.startsWith(f)) starts.push(c)
      else if (n.includes(f)) within.push(c)
      if (starts.length >= 8) break
    }
    return [...starts, ...within].slice(0, 8)
  }, [cities, q, city])

  const pick = (c: City) => {
    setCity({ city: c[0], country: c[1], name: name.trim() })
    setQ(c[0])
  }
  const ready = !!city && name.trim().length > 0
  useTicker('Any city in the world')

  return (
    <>
      <div className="setup-head">
        <span className="kicker">{title}</span>
        <h2>Name your team</h2>
        <p>Your team plays out of any city in the world. Pick the city, then the name.</p>
      </div>

      <div className="setup">
        <label className="label" htmlFor="city">
          City
        </label>
        <input
          id="city"
          className="field"
          placeholder={cities ? 'Start typing a city…' : 'Loading cities…'}
          value={q}
          autoComplete="off"
          onChange={(e) => {
            setQ(e.target.value)
            setCity(null)
          }}
        />
        {hits.length ? (
          <div className="hits">
            {hits.map((c, i) => (
              <button key={`${c[0]}|${c[1]}`} className={`hit ${i === 0 ? 'lead' : ''}`} onClick={() => pick(c)}>
                <b>{c[0]}</b>
                <span>
                  {countryName(c[1])} · {Math.round(c[2] / 1000).toLocaleString()}k
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="cap chosen">{city ? `${city.city}, ${countryName(city.country)}` : '34,000 cities, population 15,000 and up'}</div>

        <label className="label" htmlFor="tname">
          Team name
        </label>
        <input
          id="tname"
          className="field"
          placeholder="e.g. Jets"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
        />

        {/* THE PLATE — the one thing on this screen that is already the franchise: blue, and the
            name at the size it will be worn. Empty until both halves are in, because half a
            nameplate reads as a bug rather than as a prompt. */}
        {city && name.trim() ? (
          <div className="plate">
            <span className="kicker">You are</span>
            <b>
              {city.city} {name.trim()}
            </b>
          </div>
        ) : (
          <div className="plate empty">
            <span className="kicker">You are</span>
            <b>City and name make the team</b>
          </div>
        )}
        <div className="setup-note">It goes on the jersey, the banners and every result you bank.</div>
      </div>

      <div className="dock">
        <div className="dock-inner two">
          <button className="btn ghost" onClick={onBack}>
            ← Back
          </button>
          <button className="btn" disabled={!ready} onClick={() => ready && onDone({ ...city!, name: name.trim() })}>
            {ready ? `Play as the ${name.trim()}` : 'Pick a city and a name'}
          </button>
        </div>
      </div>
    </>
  )
}
