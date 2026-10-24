/**
 * THE ONE PLACE THE PRODUCT IS NAMED, AND WHERE IT LIVES.
 *
 * His decision (2026-10-22): the product stays "Game 7". The trademark search found GAME 7 filings
 * for game software (G7 IP Holdings, USPTO serials 97682027 and 98675755), so a rename may still
 * come — which is why every surface that says what the product is called (the page title, the
 * manifest, the Open Graph card, the share text, the wordmark, the footer, the privacy page, the
 * mover page) reads it from here, and changing it is one edit plus `node scripts/capture/stills.mjs`
 * for the link-preview picture. "Game 7" is also the in-game term: the Game 7 ticker.
 *
 * Read by the app (`import { SITE } from './site'`) AND by vite.config.ts at build time (the HTML
 * pages and the manifest are written from it), so this file must stay plain data: no DOM, no
 * import.meta. Anything a deploy has to set without a commit (an analytics key, a different host) is
 * an environment variable that vite.config.ts lays over these defaults — see `siteFor` below.
 */
export interface Site {
  /** The product name, as it is written in a title or a sentence. */
  name: string
  /** The home-screen label under the icon. Twelve characters or fewer reads whole on iOS. */
  shortName: string
  /** The bare domain once it is bought ('game7draft.com'), or '' while there is none. */
  domain: string
  /**
   * The absolute address of the app, with its trailing slash. Link previews need absolute URLs, so
   * the Open Graph tags and every shared link are built on this. Derived from `domain` when there is
   * one; until then it is the GitHub Pages address the game is served from today.
   */
  url: string
  /** One sentence: the meta description, the manifest description and the link-preview text. */
  description: string
  /** The link-preview headline — the og:title. */
  ogTitle: string
  /** What the 1200x630 link-preview picture shows, for screen readers (og:image:alt). */
  ogImageAlt: string
  /** The page and status-bar colour. One colour, everywhere (P4). */
  themeColor: string
  /** The line every screen with a footer ends on (P2). */
  disclaimer: string
  /** A contact address for the privacy page, or '' to leave the line out. */
  contact: string
  /**
   * The Cloudflare Web Analytics site token (public: it is printed in every page that counts). The
   * game loads the beacon itself, behind the same switches as every other measurement — the privacy
   * page's off switch, Global Privacy Control, Do Not Track, creator mode. VITE_CF_BEACON overrides.
   */
  cfBeacon: string
}

const NAME = 'Game 7'
/** Bought 2026-10-22 (Cloudflare Registrar, zone in the same account as the Pages project). Handles @game7draft. */
const DOMAIN = 'game7draft.com'
/** Where the game is served today, until a domain is bought and Cloudflare Pages takes over. */
export const LEGACY_URL = 'https://tomereinan-create.github.io/Game7/'

export const SITE: Site = {
  name: NAME,
  shortName: NAME,
  domain: DOMAIN,
  url: DOMAIN ? `https://${DOMAIN}/` : LEGACY_URL,
  description: 'Spin the wheel, draft five real players from any season since 1980, and survive a best-of-seven. Free, in your browser.',
  ogTitle: `${NAME}: spin the wheel, draft five, win the series`,
  ogImageAlt: 'A slot-machine wheel landing on a team-season above a basketball score bug reading Game 7.',
  themeColor: '#0b0a09',
  disclaimer:
    'Not affiliated with or endorsed by the NBA, NBPA, NBRPA, any team or player. Stats via Basketball-Reference.com and NBA.com.',
  // forwarded by Cloudflare Email Routing once it is set up (see the launch-gate notes)
  contact: 'hello@game7draft.com',
  cfBeacon: '7c6a23624ac24a65ab230f9af09a5364',
}

/**
 * HOSTING AND ANALYTICS, which a deploy sets rather than a commit. Every field is optional and empty
 * means off: no key, no analytics at all (the module is a no-op and never loads its script).
 */
export interface Deploy {
  /**
   * The Vite `base`. './' (the default) serves the same build from any folder, which is what GitHub
   * Pages' /Game7/ needs; a root-domain host can set '/' so a nested page (/privacy/) and the service
   * worker's scope resolve from the root. The manifest's start_url and scope follow it.
   */
  base: string
  /** PostHog project key (phc_...). Empty: no analytics. */
  posthogKey: string
  /** PostHog ingestion host. The EU cloud by default (EU visitors, ePrivacy). */
  posthogHost: string
  /** Cloudflare Web Analytics beacon token. Empty: no beacon. */
  cfBeacon: string
  /**
   * Whether the AI "iconic moments" posters and the intro clip ship in the build. ON by default: he
   * picked each one by hand, and taking them out is his call. Off, the files are left out of dist/
   * and the ladder hangs nothing (see vite.config.ts and src/ui/moments.ts).
   */
  moments: boolean
  /**
   * Whether public/provenance.json — 6.1 MB of every card's formula inputs, read only by the
   * Advanced window — ships in the build (launch plan P2). Advanced lives inside Scout mode, and
   * Scout mode is staff's alone (his ruling, 2026-10-24: "Scout mode is only for me. Once I publish
   * the game, only the user mode matters"), so a public build leaves the file out and the window's
   * buttons with it. OFF on every CI build — Cloudflare Pages for game7draft.com, publish.yml's
   * previews, apk.yml: each one is public. ON for a local `npm run build` (the localhost:5178 build
   * he plays) and the dev server. VITE_PROVENANCE=1 or 0 overrides; empty counts as unset.
   */
  provenance: boolean
}

type Env = Record<string, string | undefined>

/** The deploy settings for one build, from its environment. Used by vite.config.ts only. */
export function deployFor(env: Env): Deploy {
  return {
    base: env.BASE_PATH || './',
    posthogKey: env.VITE_POSTHOG_KEY || '',
    posthogHost: env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com',
    cfBeacon: env.VITE_CF_BEACON || '',
    moments: env.VITE_MOMENTS !== '0',
    provenance: env.VITE_PROVENANCE ? env.VITE_PROVENANCE !== '0' : !env.CI,
  }
}

/** The site for one build: a SITE_URL in the environment wins over the derived address. */
export function siteFor(env: Env): Site {
  const url = env.SITE_URL ? env.SITE_URL.replace(/\/?$/, '/') : SITE.url
  return { ...SITE, url }
}
