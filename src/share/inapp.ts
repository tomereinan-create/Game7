/**
 * WHERE THE PAGE IS OPEN — a real browser, or the browser built into a social app.
 *
 * The videos send people here from TikTok and Instagram, and both open links in their own in-app
 * browser. That browser keeps its own storage (progress made there is stranded when the app is
 * closed), it has no install prompt, and its share sheet cannot take a file. So the share card,
 * the escape button and the install hint all ask this module first. User-agent sniffing is the only
 * signal there is; the patterns below are the ones each app has shipped for years.
 */
export type InApp = 'tiktok' | 'instagram' | 'facebook' | 'snapchat' | 'x' | 'linkedin' | 'other'
export type Platform = 'ios' | 'android' | 'desktop'

const ua = (u?: string) => u ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)

export function inAppBrowser(u?: string): InApp | null {
  const s = ua(u)
  if (/BytedanceWebview|musical_ly|TikTok|\btrill_/i.test(s)) return 'tiktok'
  if (/Instagram/i.test(s)) return 'instagram'
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(s)) return 'facebook'
  if (/Snapchat/i.test(s)) return 'snapchat'
  if (/LinkedInApp/i.test(s)) return 'linkedin'
  if (/Twitter|TwitterAndroid/i.test(s)) return 'x'
  // Android WebViews mark themselves with "; wv)"; an iOS app's WKWebView has no "Safari/" token
  if (/; wv\)/.test(s)) return 'other'
  if (/iPhone|iPad|iPod/.test(s) && !/Safari\//.test(s) && !/CriOS|FxiOS|EdgiOS/.test(s)) return 'other'
  return null
}

export function platform(u?: string): Platform {
  const s = ua(u)
  if (/iPhone|iPad|iPod/.test(s)) return 'ios'
  // iPadOS asks for the desktop site and says Macintosh; a touch screen gives it away
  if (/Macintosh/.test(s) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1) return 'ios'
  if (/Android/.test(s)) return 'android'
  return 'desktop'
}

/** Opened from the home screen (an installed PWA), not a browser tab. */
export function standalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
}
