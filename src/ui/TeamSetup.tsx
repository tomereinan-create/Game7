import { useEffect, useMemo, useState } from 'react'
import type { Team } from '../state/campaign'

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
 * and up) plus a nickname. Shown before the coach the first time a campaign
 * is opened, and again from the map if you want to rename.
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

  return (
    <>
      <div className="topbar">
        <span>{title}</span>
        <button onClick={onBack}>← Back</button>
      </div>
      <div className="rule2" />
      <div className="lede">Your team plays out of any city in the world. Pick the city, then the name.</div>

      <div className="card setup">
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
            {hits.map((c) => (
              <button key={`${c[0]}|${c[1]}`} className="hit" onClick={() => pick(c)}>
                <b>{c[0]}</b>
                <span>
                  {countryName(c[1])} · {Math.round(c[2] / 1000).toLocaleString()}k
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {city ? (
          <div className="cap chosen">
            {city.city}, {countryName(city.country)}
          </div>
        ) : null}

        <label className="label" htmlFor="tname" style={{ marginTop: 16 }}>
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
        <div className="preview">
          {city && name.trim() ? (
            <>
              <span className="kicker">You are</span>
              <b>
                {city.city} {name.trim()}
              </b>
            </>
          ) : (
            <span className="cap">City and name make the team.</span>
          )}
        </div>
      </div>

      <div className="dock">
        <div className="dock-inner">
          <button className="btn" disabled={!ready} onClick={() => ready && onDone({ ...city!, name: name.trim() })}>
            {ready ? `Play as the ${city!.city} ${name.trim()}` : 'Pick a city and a name'}
          </button>
        </div>
      </div>
    </>
  )
}
