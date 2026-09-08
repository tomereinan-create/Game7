import { useEffect, useMemo, useState } from 'react'
import type { Team } from '../state/campaign'
import { useUserMode } from '../state/viewmode'
import { DEFAULT_KIT, KITS, kitColor, type Kit } from './teamColors'

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
  /**
   * THE KIT. A renamed team keeps the colours it already wears; a new one starts in the app's own
   * ice, so picking nothing is not picking wrong. The twelve are the whole picker — the two colour
   * wells under them are for the club that isn't in the twelve, and they write the same two values.
   */
  const [kit, setKit] = useState<Kit>(initial?.colors ?? DEFAULT_KIT)
  const club = kitColor(kit)

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
  const user = useUserMode()
  const ready = !!city && name.trim().length > 0
  // This screen used to state the crawl's line ("Any city in the world") while it was up. The
  // crawl itself is gone on his 2026-09-08 ruling, and the line is no loss here: the paragraph
  // under the heading already says the team plays out of any city in the world.

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

        {/* HIS RULING: "Allow me to pick my team colors when starting a campaign." Twelve kits,
            each a two-tone chip printed in the colours it actually is — the swatch IS the preview,
            so nothing here needs a name to be read. The two wells below take any pair the twelve
            don't cover, and they write the same two values, so there is no second kind of kit. */}
        <label className="label">Colours</label>
        <div className="kits">
          {KITS.map((k) => (
            <button
              key={k.name}
              className={`kit ${k.kit.primary === kit.primary && k.kit.accent === kit.accent ? 'on' : ''}`}
              style={{ '--kp': k.kit.primary, '--ka': k.kit.accent } as React.CSSProperties}
              onClick={() => setKit(k.kit)}
              aria-pressed={k.kit.primary === kit.primary && k.kit.accent === kit.accent}
              aria-label={k.name}
            >
              <i />
              <span>{k.name}</span>
            </button>
          ))}
        </div>
        <div className="kit-mix">
          <label className="kit-well">
            <input type="color" value={kit.primary} onChange={(e) => setKit({ ...kit, primary: e.target.value })} />
            <span>Main</span>
          </label>
          <label className="kit-well">
            <input type="color" value={kit.accent} onChange={(e) => setKit({ ...kit, accent: e.target.value })} />
            <span>Trim</span>
          </label>
          <span className="cap">The jersey, the busts on the floor and the ring around them.</span>
        </div>

        {/* THE PLATE — the one thing on this screen that is already the franchise: the name at the
            size it will be worn, and, since the kit is picked here, in the colours it will be worn
            in. Empty until both halves are in, because half a nameplate reads as a bug rather than
            as a prompt — and empty it keeps the kit off, so the prompt is never mistaken for a team. */}
        {city && name.trim() ? (
          <div
            className="plate kitted"
            style={{ '--kp': club.primary, '--kd': club.deep, '--ka': club.accent, '--ki': club.ink } as React.CSSProperties}
          >
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
          <button className="btn" disabled={!ready} onClick={() => ready && onDone({ ...city!, name: name.trim(), colors: kit })}>
            {/* The bundle names the whole franchise on the button — "Play as the Salt Lake City
                Sevens", the thing that goes on the jersey — where the app names only the nickname.
                User mode takes the bundle's wording; scout mode's label is untouched. */}
            {ready ? (user ? `Play as the ${city!.city} ${name.trim()}` : `Play as the ${name.trim()}`) : 'Pick a city and a name'}
          </button>
        </div>
      </div>
    </>
  )
}
