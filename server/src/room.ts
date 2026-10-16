import { DurableObject } from 'cloudflare:workers'
import { userByToken } from './auth'

/**
 * ONE ROOM, ONE ACCEPTED CHALLENGE — the draft board two phones share.
 *
 * THE ROOM KEEPS A MOVE LOG AND NOTHING ELSE. The board is drawn from `seed` by the game's own
 * `versusPool`, and every pick, loaded team, take-back and sim is a move; both phones replay the
 * log through the same code and arrive at the same two fives and the same series. So the server
 * never holds a rating, a position table or a resolver — it only decides ORDER, which is the one
 * thing two phones cannot agree on by themselves.
 *
 * ORDER IS DECIDED BY `n`. A move is sent with the length of the log the sender saw; if the log
 * has moved on, the move is refused and the sender is handed the whole state again. Two taps
 * racing for one turn therefore land one move, never two.
 *
 * WHAT THE ROOM CHECKS: that you sit in it, and that a pick or a loaded team is for your own
 * chair. Whether the pick is LEGAL is the game's law (Versus.tsx), applied before the move is sent
 * and again on replay, where an illegal move is skipped on both phones alike.
 *
 * Hibernating sockets: a room with two idle phones costs nothing between picks. Who sits where
 * rides on each socket's attachment, and the log is reloaded from storage after a wake.
 */

type Seat = 0 | 1
const RINGS = ['PG', 'SG', 'SF', 'PF', 'C']
const MAX_MOVES = 200

export type Move =
  | { k: 'pick'; side: Seat; name: string; ring: string; by: Seat }
  | { k: 'load'; side: Seat; team: string; y: number; by: Seat }
  | { k: 'undo'; by: Seat }
  | { k: 'sim'; seed: number; by: Seat }

interface Meta {
  id: string
  seats: [string, string]
  names: [string, string]
  seed: number
  round: number
}

interface Tag {
  id: string
  seat: Seat | null
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

function cleanMove(raw: unknown, by: Seat, moves: readonly Move[]): Move | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (moves.some((x) => x.k === 'sim')) return null // the series is decided; only a rematch follows
  if (m.k === 'pick' && m.side === by && str(m.name, 80) && RINGS.includes(m.ring as string)) return { k: 'pick', side: by, name: m.name, ring: m.ring as string, by }
  if (m.k === 'load' && m.side === by && str(m.team, 80) && Number.isInteger(m.y)) return { k: 'load', side: by, team: m.team, y: m.y as number, by }
  if (m.k === 'undo') return { k: 'undo', by }
  if (m.k === 'sim' && Number.isInteger(m.seed) && (m.seed as number) >= 0 && (m.seed as number) <= 0xffffffff) return { k: 'sim', seed: m.seed as number, by }
  return null
}

export class Room extends DurableObject<Env> {
  private meta: Meta | null = null
  private moves: Move[] | null = null

  async fetch(req: Request): Promise<Response> {
    const id = new URL(req.url).pathname.split('/').pop() ?? ''
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ id, seat: null } satisfies Tag)
    return new Response(null, { status: 101, webSocket: client })
  }

  /** The room's own copy of who sits where, made from D1 the first time anyone walks in. */
  private async load(id: string): Promise<Meta | null> {
    if (!this.meta) this.meta = (await this.ctx.storage.get<Meta>('meta')) ?? null
    if (!this.meta) {
      const m = await this.env.DB.prepare(
        `SELECT m.a, m.b, ua.name AS an, ub.name AS bn FROM matches m
           JOIN users ua ON ua.id = m.a JOIN users ub ON ub.id = m.b WHERE m.id = ?1`,
      )
        .bind(id)
        .first<{ a: string; b: string; an: string; bn: string }>()
      if (!m) return null
      this.meta = { id, seats: [m.a, m.b], names: [m.an, m.bn], seed: randomSeed(), round: 1 }
      await this.ctx.storage.put('meta', this.meta)
    }
    if (!this.moves) this.moves = (await this.ctx.storage.get<Move[]>('moves')) ?? []
    return this.meta
  }

  private present(except?: WebSocket): [boolean, boolean] {
    const out: [boolean, boolean] = [false, false]
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue
      const t = ws.deserializeAttachment() as Tag
      if (t.seat !== null) out[t.seat] = true
    }
    return out
  }

  private state(seat: Seat, except?: WebSocket) {
    const m = this.meta!
    return JSON.stringify({ t: 'state', seat, names: m.names, seed: m.seed, round: m.round, moves: this.moves, present: this.present(except) })
  }

  private broadcast(make: (seat: Seat) => string, except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue
      const t = ws.deserializeAttachment() as Tag
      if (t.seat === null) continue
      try {
        ws.send(make(t.seat))
      } catch {
        // a socket mid-close; its own close handler tidies up
      }
    }
  }

  private refuse(ws: WebSocket, error: string) {
    ws.send(JSON.stringify({ t: 'error', error }))
    ws.close(4000, 'refused')
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
    } catch {
      return
    }
    const tag = ws.deserializeAttachment() as Tag

    if (msg.t === 'hello') {
      const me = typeof msg.token === 'string' ? await userByToken(this.env, msg.token) : null
      if (!me) return this.refuse(ws, 'Not signed in.')
      const meta = await this.load(tag.id)
      if (!meta) return this.refuse(ws, 'That game is gone.')
      const seat = meta.seats.indexOf(me.id)
      if (seat < 0) return this.refuse(ws, 'This is not your game.')
      const row = await this.env.DB.prepare('SELECT status FROM matches WHERE id = ?1').bind(tag.id).first<{ status: string }>()
      if (row?.status !== 'live') return this.refuse(ws, 'That game is over.')
      // the same person on a second tab: the newer one takes the chair
      for (const other of this.ctx.getWebSockets()) {
        const t = other.deserializeAttachment() as Tag
        if (other !== ws && t.seat === seat) other.close(4001, 'replaced')
      }
      ws.serializeAttachment({ id: tag.id, seat: seat as Seat } satisfies Tag)
      ws.send(this.state(seat as Seat))
      this.broadcast(() => JSON.stringify({ t: 'presence', present: this.present() }), ws)
      return
    }

    if (tag.seat === null) return
    const seat = tag.seat
    const meta = await this.load(tag.id)
    if (!meta) return this.refuse(ws, 'That game is gone.')
    const moves = this.moves!

    if (msg.t === 'move') {
      const move = msg.n === moves.length && moves.length < MAX_MOVES ? cleanMove(msg.move, seat, moves) : null
      if (!move) return ws.send(this.state(seat))
      moves.push(move)
      await this.ctx.storage.put('moves', moves)
      const out = JSON.stringify({ t: 'move', n: moves.length - 1, move })
      this.broadcast(() => out)
      return
    }

    if (msg.t === 'rematch') {
      // both phones may press it; the round number makes the second press a no-op
      if (msg.round !== meta.round) return
      meta.round += 1
      meta.seed = randomSeed()
      this.moves = []
      await this.ctx.storage.put({ meta, moves: [] })
      this.broadcast((s) => this.state(s))
      return
    }

    if (msg.t === 'result') {
      // both phones report the series they replayed; the first one for the round is kept
      if (msg.round !== meta.round || (msg.winner !== 0 && msg.winner !== 1) || !moves.some((x) => x.k === 'sim')) return
      const now = Date.now()
      await this.env.DB.batch([
        this.env.DB.prepare('INSERT OR IGNORE INTO results (match, round, winner, at) VALUES (?1, ?2, ?3, ?4)').bind(meta.id, meta.round, meta.seats[msg.winner], now),
        this.env.DB.prepare('UPDATE matches SET updated_at = ?2 WHERE id = ?1').bind(meta.id, now),
      ])
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.broadcast(() => JSON.stringify({ t: 'presence', present: this.present(ws) }), ws)
  }

  async webSocketError(ws: WebSocket) {
    this.broadcast(() => JSON.stringify({ t: 'presence', present: this.present(ws) }), ws)
  }
}
