import { SITE } from '../site'

/**
 * THE LINKS THE GAME HANDS OUT — the invite, the share card's URL, the escape button.
 *
 * Every one is built on the site's own address (src/site.ts) so a link copied out of a dev server
 * still points at the real game, except on localhost, where a link that left the machine would be a
 * link to nowhere and the local address is the useful one.
 *
 * `s` is the SHARE ID (P5): a random tag minted once per share and carried on the link, so the
 * analytics can count share -> open without any ID being stored on the device. `ref` names where the
 * link was posted (tt, ig, yt, x, copy). Neither is personal and neither is saved.
 */
export function appUrl(): string {
  if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    return new URL(import.meta.env.BASE_URL, location.href).href
  }
  return SITE.url
}

/** Eight base-36 characters from the platform's random source. Not stored anywhere. */
export function newShareId(): string {
  const a = new Uint32Array(2)
  crypto.getRandomValues(a)
  return (a[0].toString(36) + a[1].toString(36)).slice(0, 8)
}

export function shareLink(q: { s?: string; ref?: string; c?: string } = {}, hash = ''): string {
  const u = new URL(appUrl())
  for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v)
  if (hash) u.hash = hash
  return u.href
}

/** The address without its scheme, for printing on a card: "buzzerdraft.com" or "x.github.io/Game7". */
export function printedUrl(): string {
  return appUrl().replace(/^https?:\/\//, '').replace(/\/$/, '')
}
