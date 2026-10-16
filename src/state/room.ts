import { useCallback, useEffect, useRef, useState } from 'react'
import { FRIENDS_API, loadAccount } from './friends'
import type { VsMove } from '../ui/Versus'

/**
 * ONE PHONE'S SEAT IN AN ONLINE ROOM (server/src/room.ts). The room sends the whole state on
 * join and each move after it; this hook keeps the log and hands it to Versus, which replays it
 * exactly as it replays its own taps on one phone.
 *
 * A dropped socket — a lift, a tunnel, a phone put to sleep — reconnects on a backoff, and at
 * once when the page is looked at again. Rejoining is a fresh `state`, so nothing missed while
 * away has to be pieced together.
 */
export interface RoomState {
  seat: 0 | 1
  names: [string, string]
  seed: number
  round: number
  moves: VsMove[]
  present: [boolean, boolean]
}

export type RoomStatus = 'connecting' | 'open' | 'retrying' | 'over'

export function useRoom(id: string) {
  const [room, setRoom] = useState<RoomState | null>(null)
  const [status, setStatus] = useState<RoomStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const ws = useRef<WebSocket | null>(null)
  const roomRef = useRef(room)
  roomRef.current = room

  useEffect(() => {
    let alive = true
    let over = false
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const token = loadAccount()?.token
    const end = (why: string) => {
      over = true
      setError(why)
      setStatus('over')
    }
    if (!token) {
      end('Not signed in.')
      return
    }
    const hello = (s: WebSocket) => s.send(JSON.stringify({ t: 'hello', token }))

    const open = () => {
      const s = new WebSocket(`${FRIENDS_API.replace(/^http/, 'ws')}/api/rooms/${id}`)
      ws.current = s
      s.onopen = () => hello(s)
      s.onmessage = (ev) => {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(String(ev.data))
        } catch {
          return
        }
        if (msg.t === 'state') {
          tries = 0
          setStatus('open')
          const { seat, names, seed, round, moves, present } = msg as unknown as RoomState
          setRoom({ seat, names, seed, round, moves, present })
        } else if (msg.t === 'move') {
          const cur = roomRef.current
          // a gap means a message was lost on the way: ask for the whole state again
          if (!cur || msg.n !== cur.moves.length) return hello(s)
          const next = { ...cur, moves: [...cur.moves, msg.move as VsMove] }
          roomRef.current = next
          setRoom(next)
        } else if (msg.t === 'presence') {
          setRoom((cur) => (cur ? { ...cur, present: msg.present as [boolean, boolean] } : cur))
        } else if (msg.t === 'error') {
          end(String(msg.error))
        }
      }
      s.onclose = (ev) => {
        if (!alive || over || ws.current !== s) return
        if (ev.code === 4001) return end('This game was opened on another screen.')
        setStatus('retrying')
        timer = setTimeout(open, Math.min(8000, 500 * 2 ** tries++))
      }
    }

    const wake = () => {
      const s = ws.current
      if (document.visibilityState !== 'visible' || over || !s || s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING) return
      clearTimeout(timer)
      tries = 0
      open()
    }

    open()
    document.addEventListener('visibilitychange', wake)
    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
      ws.current?.close()
      ws.current = null
    }
  }, [id])

  const say = useCallback((msg: object) => {
    const s = ws.current
    if (s?.readyState === WebSocket.OPEN) s.send(JSON.stringify(msg))
  }, [])

  const send = useCallback((move: VsMove) => say({ t: 'move', n: roomRef.current?.moves.length ?? 0, move }), [say])
  const rematch = useCallback(() => say({ t: 'rematch', round: roomRef.current?.round }), [say])
  const report = useCallback((winner: 0 | 1) => say({ t: 'result', round: roomRef.current?.round, winner }), [say])

  return { room, status, error, send, rematch, report }
}
