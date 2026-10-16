/**
 * GAME7 FRIENDS — the one server the game has.
 *
 * Everything else in Game7 runs on the phone with no network. This Worker exists for the one thing
 * a phone cannot do alone: know who your friends are and put two phones at one draft board.
 *
 *   · AN ACCOUNT IS A NAME AND A FRIEND CODE. No email, no password. Registering hands the phone a
 *     random token; the server keeps only its SHA-256. Lose the phone's storage and the account is
 *     gone — that is the price of asking nobody for anything.
 *   · A FRIEND IS ADDED BY CODE. A request waits until the other side accepts; if both sides send
 *     one, the second send is the acceptance.
 *   · A CHALLENGE IS A ROOM. Accepting it opens a Durable Object (room.ts) that keeps the draft's
 *     move log and relays each pick to the other phone. The game's own code replays the log on
 *     both phones, so the server never needs to know a single player's rating.
 *
 * The bearer token is the only credential and it never rides in a cookie, so CORS is open: there
 * is no ambient authority for another origin to borrow. That is what lets the same Worker serve
 * GitHub Pages, the Android app (https://localhost) and a dev server on any port.
 */
import { type Me, sha256, userByToken } from './auth'
import { Room } from './room'

export { Room }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
const fail = (status: number, error: string) => json({ error }, status)

/** No 0/O, 1/I/L — a code is read aloud and typed on a phone. */
const CODE_ABC = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LEN = 6
/** A challenge nobody answers in an hour is stale; a room nobody touched in a day is over. */
const INVITE_TTL = 60 * 60 * 1000
const ROOM_TTL = 24 * 60 * 60 * 1000
/** Seen inside this window reads as online — the Friends screen polls every few seconds. */
const ONLINE_MS = 45 * 1000
const MAX_FRIENDS = 200

const randomCode = () => {
  const b = crypto.getRandomValues(new Uint8Array(CODE_LEN))
  return Array.from(b, (x) => CODE_ABC[x % CODE_ABC.length]).join('')
}
const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 2–16 visible characters, inner whitespace collapsed. Names need not be unique; codes are. */
function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  return s.length >= 2 && s.length <= 16 ? s : null
}
const cleanCode = (raw: unknown) => (typeof raw === 'string' ? raw.toUpperCase().replace(/[^0-9A-Z]/g, '') : '')

const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x])

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json()
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function register(env: Env, req: Request) {
  const name = cleanName((await body(req)).name)
  if (!name) return fail(400, 'A name is 2 to 16 characters.')
  const token = randomToken()
  const hash = await sha256(token)
  const id = crypto.randomUUID()
  const now = Date.now()
  // a collision in 31^6 is rare, not impossible — try a few codes before giving up
  for (let k = 0; k < 5; k++) {
    const code = randomCode()
    try {
      await env.DB.prepare('INSERT INTO users (id, name, code, token_hash, created_at, seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)')
        .bind(id, name, code, hash, now)
        .run()
      return json({ id, name, code, token })
    } catch (e) {
      if (!String(e).includes('UNIQUE')) throw e
    }
  }
  return fail(503, 'Could not mint a code — try again.')
}

/** Everything the Friends screen draws, in one read. */
async function snapshot(env: Env, me: Me) {
  const now = Date.now()
  const [friends, records, matches] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id, u.name, u.code, u.seen_at AS seen, f.status, f.requested_by AS by
         FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ?1 THEN f.b ELSE f.a END
        WHERE f.a = ?1 OR f.b = ?1
        ORDER BY u.name COLLATE NOCASE`,
    ).bind(me.id),
    env.DB.prepare(
      `SELECT CASE WHEN m.a = ?1 THEN m.b ELSE m.a END AS foe,
              SUM(r.winner = ?1) AS w, SUM(r.winner <> ?1) AS l
         FROM results r JOIN matches m ON m.id = r.match
        WHERE m.a = ?1 OR m.b = ?1
        GROUP BY foe`,
    ).bind(me.id),
    env.DB.prepare(
      `SELECT m.id, m.a, m.b, m.status, m.created_at AS at, m.updated_at AS touched, u.name AS vs
         FROM matches m JOIN users u ON u.id = CASE WHEN m.a = ?1 THEN m.b ELSE m.a END
        WHERE (m.a = ?1 OR m.b = ?1)
          AND ((m.status = 'invited' AND m.created_at > ?2) OR (m.status = 'live' AND m.updated_at > ?3))
        ORDER BY m.created_at DESC`,
    ).bind(me.id, now - INVITE_TTL, now - ROOM_TTL),
  ])
  type FRow = { id: string; name: string; code: string; seen: number; status: string; by: string }
  type RRow = { foe: string; w: number; l: number }
  type MRow = { id: string; a: string; b: string; status: string; at: number; touched: number; vs: string }
  const rec = new Map((records.results as RRow[]).map((r) => [r.foe, r]))
  const rows = friends.results as FRow[]
  const ms = matches.results as MRow[]
  const foeOf = (m: MRow) => (m.a === me.id ? m.b : m.a)
  return {
    me,
    friends: rows
      .filter((r) => r.status === 'friends')
      .map((r) => ({ id: r.id, name: r.name, code: r.code, online: now - r.seen < ONLINE_MS, seen: r.seen, w: rec.get(r.id)?.w ?? 0, l: rec.get(r.id)?.l ?? 0 })),
    incoming: rows.filter((r) => r.status === 'pending' && r.by !== me.id).map((r) => ({ id: r.id, name: r.name, code: r.code })),
    outgoing: rows.filter((r) => r.status === 'pending' && r.by === me.id).map((r) => ({ id: r.id, name: r.name, code: r.code })),
    challenges: ms.filter((m) => m.status === 'invited').map((m) => ({ id: m.id, friend: foeOf(m), name: m.vs, mine: m.a === me.id, at: m.at })),
    live: ms.filter((m) => m.status === 'live').map((m) => ({ id: m.id, friend: foeOf(m), name: m.vs, seat: m.a === me.id ? 0 : 1, at: m.touched })),
    now,
  }
}

async function addFriend(env: Env, me: Me, req: Request) {
  const code = cleanCode((await body(req)).code)
  if (code.length !== CODE_LEN) return fail(400, `A friend code is ${CODE_LEN} letters and numbers.`)
  if (code === me.code) return fail(400, 'That is your own code.')
  const them = await env.DB.prepare('SELECT id, name FROM users WHERE code = ?1').bind(code).first<{ id: string; name: string }>()
  if (!them) return fail(404, 'No one has that code.')
  const [a, b] = pair(me.id, them.id)
  const row = await env.DB.prepare('SELECT status, requested_by AS by FROM friends WHERE a = ?1 AND b = ?2').bind(a, b).first<{ status: string; by: string }>()
  if (row?.status === 'friends') return json({ ok: true, status: 'friends', name: them.name })
  if (row && row.by !== me.id) {
    // they asked first: sending one back is saying yes
    await env.DB.prepare("UPDATE friends SET status = 'friends' WHERE a = ?1 AND b = ?2").bind(a, b).run()
    return json({ ok: true, status: 'friends', name: them.name })
  }
  if (row) return json({ ok: true, status: 'pending', name: them.name })
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM friends WHERE a = ?1 OR b = ?1').bind(me.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_FRIENDS) return fail(400, `That is ${MAX_FRIENDS} friends — remove one first.`)
  await env.DB.prepare("INSERT INTO friends (a, b, status, requested_by, created_at) VALUES (?1, ?2, 'pending', ?3, ?4)").bind(a, b, me.id, Date.now()).run()
  return json({ ok: true, status: 'pending', name: them.name })
}

async function acceptFriend(env: Env, me: Me, other: string) {
  const [a, b] = pair(me.id, other)
  const r = await env.DB.prepare("UPDATE friends SET status = 'friends' WHERE a = ?1 AND b = ?2 AND status = 'pending' AND requested_by <> ?3").bind(a, b, me.id).run()
  return r.meta.changes ? json({ ok: true }) : fail(404, 'No request from them.')
}

/** Decline a request, cancel your own, or unfriend — all three are the row going away. */
async function dropFriend(env: Env, me: Me, other: string) {
  const [a, b] = pair(me.id, other)
  await env.DB.prepare('DELETE FROM friends WHERE a = ?1 AND b = ?2').bind(a, b).run()
  return json({ ok: true })
}

async function challenge(env: Env, me: Me, req: Request) {
  const to = (await body(req)).to
  if (typeof to !== 'string') return fail(400, 'Who is it for?')
  const [a, b] = pair(me.id, to)
  const f = await env.DB.prepare('SELECT status FROM friends WHERE a = ?1 AND b = ?2').bind(a, b).first<{ status: string }>()
  if (f?.status !== 'friends') return fail(403, 'You can only challenge a friend.')
  const now = Date.now()
  const open = await env.DB.prepare(
    `SELECT id, a FROM matches
      WHERE ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)) AND status = 'invited' AND created_at > ?3
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(me.id, to, now - INVITE_TTL)
    .first<{ id: string; a: string }>()
  if (open?.a === me.id) return json({ id: open.id, status: 'invited' })
  if (open) {
    // they already challenged you: challenging back is accepting
    await env.DB.prepare("UPDATE matches SET status = 'live', updated_at = ?2 WHERE id = ?1").bind(open.id, now).run()
    return json({ id: open.id, status: 'live' })
  }
  const id = crypto.randomUUID()
  await env.DB.prepare("INSERT INTO matches (id, a, b, status, created_at, updated_at) VALUES (?1, ?2, ?3, 'invited', ?4, ?4)").bind(id, me.id, to, now).run()
  return json({ id, status: 'invited' })
}

async function acceptChallenge(env: Env, me: Me, id: string) {
  const r = await env.DB.prepare("UPDATE matches SET status = 'live', updated_at = ?3 WHERE id = ?1 AND b = ?2 AND status = 'invited' AND created_at > ?4")
    .bind(id, me.id, Date.now(), Date.now() - INVITE_TTL)
    .run()
  return r.meta.changes ? json({ id, status: 'live' }) : fail(404, 'That challenge is gone.')
}

/** Decline (the challenged), cancel (the challenger) or leave a finished room (either). */
async function dropChallenge(env: Env, me: Me, id: string) {
  await env.DB.prepare(
    `UPDATE matches SET status = CASE WHEN status = 'invited' THEN 'declined' ELSE 'closed' END, updated_at = ?3
      WHERE id = ?1 AND (a = ?2 OR b = ?2) AND status IN ('invited', 'live')`,
  )
    .bind(id, me.id, Date.now())
    .run()
  return json({ ok: true })
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname.replace(/\/+$/, '')
  const m = req.method

  if (path === '/api/register' && m === 'POST') return register(env, req)

  // the room authenticates on its own first message — a browser cannot put a header on a WebSocket
  const room = path.match(/^\/api\/rooms\/([0-9a-f-]{36})$/)
  if (room) {
    if (req.headers.get('Upgrade') !== 'websocket') return fail(426, 'WebSocket only.')
    return env.ROOM.get(env.ROOM.idFromName(room[1])).fetch(req)
  }

  const auth = req.headers.get('Authorization') ?? ''
  const me = auth.startsWith('Bearer ') ? await userByToken(env, auth.slice(7)) : null
  if (!me) return fail(401, 'Not signed in.')

  if (path === '/api/me' && m === 'GET') return json(await snapshot(env, me))
  if (path === '/api/me' && m === 'PATCH') {
    const name = cleanName((await body(req)).name)
    if (!name) return fail(400, 'A name is 2 to 16 characters.')
    await env.DB.prepare('UPDATE users SET name = ?2 WHERE id = ?1').bind(me.id, name).run()
    return json(await snapshot(env, { ...me, name }))
  }
  if (path === '/api/friends' && m === 'POST') return addFriend(env, me, req)
  let hit = path.match(/^\/api\/friends\/([0-9a-f-]{36})(\/accept)?$/)
  if (hit && m === 'POST' && hit[2]) return acceptFriend(env, me, hit[1])
  if (hit && m === 'DELETE' && !hit[2]) return dropFriend(env, me, hit[1])
  if (path === '/api/challenges' && m === 'POST') return challenge(env, me, req)
  hit = path.match(/^\/api\/challenges\/([0-9a-f-]{36})(\/accept)?$/)
  if (hit && m === 'POST' && hit[2]) return acceptChallenge(env, me, hit[1])
  if (hit && m === 'DELETE' && !hit[2]) return dropChallenge(env, me, hit[1])
  return fail(404, 'No such thing.')
}

export default {
  async fetch(req, env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    try {
      return await route(req, env)
    } catch (e) {
      console.error(e)
      return fail(500, 'The server tripped. Try again.')
    }
  },
} satisfies ExportedHandler<Env>
