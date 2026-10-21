/**
 * THE ONE PLACE THE PRODUCT IS NAMED, AND WHERE IT LIVES.
 *
 * "Game 7" cannot be the product's brand: G7 IP Holdings holds approved GAME 7 applications for game
 * software and online games (USPTO serials 97682027 and 98675755). The name is undecided, so every
 * surface that says what the product is called — the page title, the manifest, the Open Graph card,
 * the share text, the footer, the privacy page, the mover page — reads it from here, and changing
 * it is one edit. "Game 7" stays as an in-game term: the Game 7 ticker, "survive Game 7".
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
  /** The bare domain once it is bought ('buzzerdraft.com'), or '' while there is none. */
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
}

const NAME = 'Buzzer Draft'
const DOMAIN = ''
/** Where the game is served today, until a domain is bought and Cloudflare Pages takes over. */
export const LEGACY_URL = 'https://tomereinan-create.github.io/Game7/'

export const SITE: Site = {
  name: NAME,
  shortName: NAME,
  domain: DOMAIN,
  url: DOMAIN ? `https://${DOMAIN}/` : LEGACY_URL,
  description: 'Spin the wheel, draft five real players from any season since 1980, and survive a best-of-seven. Free, in your browser.',
  ogTitle: `${NAME}: spin, draft five, survive Game 7`,
  ogImageAlt: 'A slot-machine wheel landing on a team-season above a basketball score bug reading Game 7.',
  themeColor: '#0b0a09',
  disclaimer:
    'Not affiliated with or endorsed by the NBA, NBPA, NBRPA, any team or player. Stats via Basketball-Reference.com and NBA.com.',
  contact: '',
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
  }
}

/** The site for one build: a SITE_URL in the environment wins over the derived address. */
export function siteFor(env: Env): Site {
  const url = env.SITE_URL ? env.SITE_URL.replace(/\/?$/, '/') : SITE.url
  return { ...SITE, url }
}
