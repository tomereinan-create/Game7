import type { Team } from './campaign'
import { KITS } from '../ui/teamColors'

/**
 * A CLUB FOR A NEW VISITOR, NAMED WITHOUT ASKING (P1, the launch gate). The name screen was a toll
 * of eight taps and some typing on the way to the first spin — a city search over 34,000 places, a
 * nickname, three letters, a kit — paid before the visitor had seen the one thing the videos sent
 * them for. So a first campaign is named here, at random, and the map's rename door (TeamSetup, as
 * before) changes it whenever they like.
 *
 * The cities are a hand-picked set rather than a draw from the 34,000 in public/cities.json: that
 * file is 0.36 MB over the wire, the first spin should not wait on it, and a random draw from it is
 * mostly towns nobody has heard of. The nicknames avoid every NBA club's, so an auto-named club can
 * never be mistaken for a real one.
 */
const CITIES: [string, string][] = [
  ['Tel Aviv', 'IL'], ['Haifa', 'IL'], ['Belgrade', 'RS'], ['Kaunas', 'LT'], ['Vilnius', 'LT'], ['Riga', 'LV'],
  ['Zagreb', 'HR'], ['Split', 'HR'], ['Ljubljana', 'SI'], ['Athens', 'GR'], ['Thessaloniki', 'GR'], ['Istanbul', 'TR'],
  ['Madrid', 'ES'], ['Barcelona', 'ES'], ['Valencia', 'ES'], ['Bologna', 'IT'], ['Milan', 'IT'], ['Paris', 'FR'],
  ['Lyon', 'FR'], ['Munich', 'DE'], ['Berlin', 'DE'], ['London', 'GB'], ['Manchester', 'GB'], ['Lisbon', 'PT'],
  ['Seattle', 'US'], ['Las Vegas', 'US'], ['Kansas City', 'US'], ['St. Louis', 'US'], ['Louisville', 'US'], ['Nashville', 'US'],
  ['San Diego', 'US'], ['Baltimore', 'US'], ['Pittsburgh', 'US'], ['Cincinnati', 'US'], ['Austin', 'US'], ['Honolulu', 'US'],
  ['Vancouver', 'CA'], ['Montreal', 'CA'], ['Mexico City', 'MX'], ['Monterrey', 'MX'], ['San Juan', 'PR'], ['Santo Domingo', 'DO'],
  ['Havana', 'CU'], ['Buenos Aires', 'AR'], ['São Paulo', 'BR'], ['Rio de Janeiro', 'BR'], ['Lagos', 'NG'], ['Dakar', 'SN'],
  ['Nairobi', 'KE'], ['Cairo', 'EG'], ['Dubai', 'AE'], ['Mumbai', 'IN'], ['Manila', 'PH'], ['Cebu', 'PH'],
  ['Taipei', 'TW'], ['Seoul', 'KR'], ['Tokyo', 'JP'], ['Osaka', 'JP'], ['Shanghai', 'CN'], ['Beijing', 'CN'],
  ['Sydney', 'AU'], ['Melbourne', 'AU'], ['Perth', 'AU'], ['Auckland', 'NZ'],
]
const NICKNAMES = [
  'Comets', 'Pilots', 'Foxes', 'Owls', 'Sharks', 'Tides', 'Express', 'Monarchs', 'Voyagers', 'Phantoms',
  'Volts', 'Meteors', 'Harbors', 'Sevens', 'Admirals', 'Lanterns', 'Cyclones', 'Ravens', 'Stallions', 'Breakers',
]

const pick = <T>(xs: readonly T[], r: () => number) => xs[Math.floor(r() * xs.length) % xs.length]

export function autoTeam(r: () => number = Math.random): Team {
  const [city, country] = pick(CITIES, r)
  return { city, country, name: pick(NICKNAMES, r), colors: pick(KITS, r).kit }
}
