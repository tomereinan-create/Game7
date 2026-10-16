import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * FRIENDS — the one part of Game7 that needs the network (the ruling, 2026-10-16: "Add option to
 * add friends", and online friends over pass-the-phone when asked which).
 *
 * The server is server/ in this repo, a Cloudflare Worker. Under `vite` (npm run dev) the game talks
 * to `wrangler dev` on port 8787 of whatever host served the page, so a phone on the same Wi-Fi
 * reaches the desk's copy too; a build talks to the deployed Worker. VITE_FRIENDS_API overrides
 * both.
 *
 * THE ACCOUNT LIVES IN THIS BROWSER'S STORAGE: a name, a friend code, and the token that is the
 * whole credential. There is no password to forget and nothing to recover — clear the site's data
 * and the friend code goes with it.
 */
export const FRIENDS_API: string =
  (import.meta.env.VITE_FRIENDS_API as string | undefined) ||
  // `location` is read only when there is one: the tests import the front door under node
  (import.meta.env.DEV ? `http://${typeof location === 'undefined' ? 'localhost' : location.hostname}:8787` : 'https://game7-friends.tomereinan.workers.dev')

export interface Account {
  id: string
  name: string
  code: string
  token: string
}

export interface Friend {
  id: string
  name: string
  code: string
  online: boolean
  seen: number
  w: number
  l: number
}

export interface Snapshot {
  me: { id: string; name: string; code: string }
  friends: Friend[]
  incoming: { id: string; name: string; code: string }[]
  outgoing: { id: string; name: string; code: string }[]
  /** Open challenges, both ways — `mine` is true for the ones this phone sent. */
  challenges: { id: string; friend: string; name: string; mine: boolean; at: number }[]
  /** Accepted challenges whose room is still open. */
  live: { id: string; friend: string; name: string; seat: 0 | 1; at: number }[]
  now: number
}

const KEY = 'game7.friends.v1'

export function loadAccount(): Account | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return a && typeof a.token === 'string' && typeof a.code === 'string' ? (a as Account) : null
  } catch {
    return null
  }
}

function saveAccount(a: Account | null) {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a))
    else localStorage.removeItem(KEY)
  } catch {
    // private window: the account lasts as long as the tab
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(FRIENDS_API + path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError('No connection to the friends server.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `The server said ${res.status}.`, res.status)
  return data as T
}

export async function register(name: string): Promise<Account> {
  const a = await api<Account>('/api/register', { body: { name } })
  saveAccount(a)
  return a
}

/**
 * The Friends screen's whole state, refreshed every `pollMs` while the page is visible. A 401 means
 * the server no longer knows this token (the account was deleted), so it is dropped here and the
 * screen offers a fresh one rather than failing forever.
 */
export function useFriends(pollMs: number) {
  const [account, setAccount] = useState<Account | null>(loadAccount)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef(account?.token)
  tokenRef.current = account?.token

  const refresh = useCallback(async () => {
    const token = tokenRef.current
    if (!token) return
    try {
      const s = await api<Snapshot>('/api/me', { token })
      if (tokenRef.current !== token) return
      setSnap(s)
      setError(null)
      const cur = loadAccount()
      if (cur && cur.name !== s.me.name) {
        const next = { ...cur, name: s.me.name }
        saveAccount(next)
        setAccount(next)
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        saveAccount(null)
        setAccount(null)
        setSnap(null)
      }
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (!account) return
    refresh()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, pollMs)
    return () => clearInterval(t)
  }, [account, pollMs, refresh])

  /** Run an authenticated change (a POST unless told otherwise), then redraw from the server. */
  const act = useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
      const out = await api<T>(path, { method: 'POST', ...init, token: tokenRef.current })
      await refresh()
      return out
    },
    [refresh],
  )

  const signUp = useCallback(async (name: string) => {
    const a = await register(name)
    setAccount(a)
  }, [])

  return { account, snap, error, refresh, act, signUp }
}

/** The front door's one line about friends: how many are waiting on you, or how many you have. */
export function useFriendsNote(): string {
  const [note, setNote] = useState(() => (loadAccount() ? '—' : 'Add'))
  useEffect(() => {
    const token = loadAccount()?.token
    if (!token) return
    let alive = true
    const read = () =>
      api<Snapshot>('/api/me', { token })
        .then((s) => {
          if (!alive) return
          const waiting = s.incoming.length + s.challenges.filter((c) => !c.mine).length
          setNote(waiting ? `${waiting} new` : String(s.friends.length))
        })
        .catch(() => alive && setNote('Offline'))
    read()
    const t = setInterval(() => document.visibilityState === 'visible' && read(), 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  return note
}
