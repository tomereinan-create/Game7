/**
 * www.game7draft.com -> https://game7draft.com, permanently, path and query kept.
 *
 * The game itself is the Cloudflare Pages project `game7draft` on the apex. This one-file Worker owns
 * only the www host (a Workers custom domain, so Cloudflare keeps its DNS record and certificate),
 * which is why the redirect needed no dashboard rule. Only www traffic ever reaches it, so it costs
 * nothing against the Workers free tier in practice.
 *
 *   cd deploy/www-redirect && wrangler deploy
 */
export default {
  fetch(request) {
    const url = new URL(request.url)
    url.protocol = 'https:'
    url.hostname = 'game7draft.com'
    url.port = ''
    return Response.redirect(url.href, 301)
  },
}
