import { useEffect, useRef, useState } from 'react'
import { useFriends, type Snapshot } from '../state/friends'
import { useRoom, type RoomState } from '../state/room'
import { Versus } from './Versus'

/**
 * FRIENDS — the ruling, 2026-10-16: "Add option to add friends", and, asked whether that meant a
 * list on this phone, links, or friends online, ONLINE: accounts, friend codes, and a game played
 * from two phones.
 *
 * WHAT THE SCREEN DOES, top to bottom, and it hides what is empty:
 *   · no account yet: one field for the name your friends will see — no email, no password;
 *   · your friend code, to copy or share;
 *   · a field for a friend's code;
 *   · challenges waiting on you, games still in progress, friend requests waiting on you;
 *   · your friends — online now or when last seen, your series record against each, and a
 *     CHALLENGE button; and the requests you sent that nobody has answered.
 *
 * A CHALLENGE IS PLAYER VS FRIEND ON TWO PHONES: the same board of twelve, the same snake, the
 * same law, the same series screen (Versus.tsx, fed by the room). When a challenge this phone sent
 * is accepted the game opens here by itself.
 */

const ago = (ms: number) => {
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

export function Friends({ onHome }: { onHome: () => void }) {
  const f = useFriends(4000)
  const [room, setRoom] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [copied, setCopied] = useState(false)

  // a challenge this phone sent opens by itself the moment the friend accepts it
  const sent = useRef(new Set<string>())
  useEffect(() => {
    if (!f.snap || room) return
    for (const c of f.snap.challenges) if (c.mine) sent.current.add(c.id)
    const hit = f.snap.live.find((l) => sent.current.has(l.id))
    if (hit) {
      sent.current.delete(hit.id)
      setRoom(hit.id)
    }
  }, [f.snap, room])

  // a note answers the tap that made it; it should not still be standing a minute later
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 6000)
    return () => clearTimeout(t)
  }, [note])

  /** Every button here is one call; its error is said in the line under the code field. */
  const run = async (job: () => Promise<unknown>) => {
    setBusy(true)
    setNote(null)
    try {
      await job()
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (room)
    return (
      <OnlineMatch
        id={room}
        onLeave={() => {
          setRoom(null)
          f.refresh()
        }}
      />
    )

  const head = (
    <>
      <div className="topbar">
        <span>Friends</span>
      </div>
      <div className="rule2" />
    </>
  )

  if (!f.account)
    return (
      <>
        {head}
        <div className="card fr-card">
          <div className="card-head">
            <span className="label">Pick the name your friends will see</span>
          </div>
          <form
            className="fr-add"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => f.signUp(name))
            }}
          >
            <input className="field" maxLength={16} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn" disabled={busy || name.trim().length < 2}>
              Get my friend code
            </button>
          </form>
          {note ? <div className="fr-note">{note}</div> : null}
          <div className="cap hint">No email and no password. Your code lives on this phone — clearing the site’s data deletes it.</div>
        </div>
        <div className="dock">
          <div className="dock-inner">
            <button className="btn ghost" onClick={onHome}>
              Back to the board
            </button>
          </div>
        </div>
      </>
    )

  const s: Snapshot | null = f.snap
  const myCode = s?.me.code ?? f.account.code
  const now = s?.now ?? Date.now()
  const challengedBy = new Map((s?.challenges ?? []).filter((c) => !c.mine).map((c) => [c.friend, c]))
  const challengedTo = new Map((s?.challenges ?? []).filter((c) => c.mine).map((c) => [c.friend, c]))
  const playing = new Map((s?.live ?? []).map((g) => [g.friend, g]))

  const share = async () => {
    const text = `Add me on Game7 — my friend code is ${myCode}`
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch {
        // dismissed, or not allowed here: fall through to the clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(myCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setNote('Could not copy — read it out instead.')
    }
  }

  const challenge = (to: string) =>
    run(async () => {
      const r = await f.act<{ id: string; status: string }>('/api/challenges', { body: { to } })
      if (r.status === 'live') setRoom(r.id)
      else sent.current.add(r.id)
    })

  return (
    <>
      {head}

      <div className="card fr-card">
        <div className="card-head">
          <span className="label">Your friend code</span>
          {renaming ? null : (
            <button className="chip-btn" onClick={() => (setName(f.account!.name), setRenaming(true))}>
              Rename
            </button>
          )}
        </div>
        {renaming ? (
          <form
            className="fr-add"
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                await f.act('/api/me', { method: 'PATCH', body: { name } })
                setRenaming(false)
              })
            }}
          >
            <input className="field" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn" disabled={busy || name.trim().length < 2}>
              Save
            </button>
          </form>
        ) : (
          <div className="fr-me">
            <span className="fr-code">{myCode}</span>
            <span className="fr-who">
              <b>{s?.me.name ?? f.account.name}</b>
              <button className="map-link" onClick={share}>
                {copied ? 'Copied' : 'Share my code →'}
              </button>
            </span>
          </div>
        )}
      </div>

      <div className="card fr-card">
        <div className="card-head">
          <span className="label">Add a friend</span>
        </div>
        <form
          className="fr-add row"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              const r = await f.act<{ status: string; name: string }>('/api/friends', { body: { code } })
              setCode('')
              setNote(r.status === 'friends' ? `You and ${r.name} are friends.` : `Sent — ${r.name} has to accept.`)
            })
          }}
        >
          <input
            className="field code"
            maxLength={8}
            placeholder="Their code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn" disabled={busy || code.replace(/[^0-9A-Z]/gi, '').length !== 6}>
            Send request
          </button>
        </form>
        {note ? <div className="fr-note">{note}</div> : null}
        {f.error && !s ? <div className="fr-note">{f.error}</div> : null}
      </div>

      {s && challengedBy.size ? (
        <div className="card fr-card">
          <div className="card-head">
            <span className="label">Challenges</span>
          </div>
          {[...challengedBy.values()].map((c) => (
            <div className="lrow" key={c.id}>
              <span className="lwho">
                <b>{c.name}</b>
                <i>wants a game · {ago(now - c.at)}</i>
              </span>
              <span className="fr-acts">
                <button className="chip-btn" disabled={busy} onClick={() => run(() => f.act(`/api/challenges/${c.id}`, { method: 'DELETE' }))}>
                  No thanks
                </button>
                <button
                  className="chip-btn on"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await f.act(`/api/challenges/${c.id}/accept`)
                      setRoom(c.id)
                    })
                  }
                >
                  Play
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {s && s.live.length ? (
        <div className="card fr-card">
          <div className="card-head">
            <span className="label">Games in progress</span>
          </div>
          {s.live.map((g) => (
            <div className="lrow" key={g.id}>
              <span className="lwho">
                <b>vs {g.name}</b>
                <i>last move {ago(now - g.at)}</i>
              </span>
              <span className="fr-acts">
                <button className="chip-btn" disabled={busy} onClick={() => run(() => f.act(`/api/challenges/${g.id}`, { method: 'DELETE' }))}>
                  Leave
                </button>
                <button className="chip-btn on" onClick={() => setRoom(g.id)}>
                  Resume
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {s && s.incoming.length ? (
        <div className="card fr-card">
          <div className="card-head">
            <span className="label">Friend requests</span>
          </div>
          {s.incoming.map((r) => (
            <div className="lrow" key={r.id}>
              <span className="lwho">
                <b>{r.name}</b>
                <i>{r.code}</i>
              </span>
              <span className="fr-acts">
                <button className="chip-btn" disabled={busy} onClick={() => run(() => f.act(`/api/friends/${r.id}`, { method: 'DELETE' }))}>
                  Decline
                </button>
                <button className="chip-btn on" disabled={busy} onClick={() => run(() => f.act(`/api/friends/${r.id}/accept`))}>
                  Accept
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card fr-card">
        <div className="card-head">
          <span className="label">Friends{s ? ` · ${s.friends.length}` : ''}</span>
          {s && (s.friends.length || s.outgoing.length) ? (
            <button className="chip-btn" onClick={() => setEdit(!edit)}>
              {edit ? 'Done' : 'Edit'}
            </button>
          ) : null}
        </div>
        {!s ? (
          <div className="cap hint">{f.error ?? 'Loading…'}</div>
        ) : !s.friends.length && !s.outgoing.length ? (
          <div className="cap hint">Nobody yet. Share your code, or type a friend’s above.</div>
        ) : null}
        {s?.friends.map((fr) => {
          const theirs = challengedBy.get(fr.id)
          const mine = challengedTo.get(fr.id)
          const game = playing.get(fr.id)
          return (
            <div className="lrow" key={fr.id}>
              <span className="lwho">
                <b>
                  {fr.online ? <span className="fr-dot" aria-label="online" /> : null}
                  {fr.name}
                </b>
                <i>
                  {fr.online ? 'online now' : `seen ${ago(now - fr.seen)}`}
                  {fr.w + fr.l ? ` · you ${fr.w}–${fr.l}` : ''}
                </i>
              </span>
              <span className="fr-acts">
                {edit ? (
                  <button
                    className="chip-btn danger"
                    disabled={busy}
                    onClick={() => window.confirm(`Remove ${fr.name} from your friends?`) && run(() => f.act(`/api/friends/${fr.id}`, { method: 'DELETE' }))}
                  >
                    Remove
                  </button>
                ) : game ? (
                  <button className="chip-btn on" onClick={() => setRoom(game.id)}>
                    Resume
                  </button>
                ) : mine ? (
                  <button className="chip-btn" disabled={busy} onClick={() => run(() => f.act(`/api/challenges/${mine.id}`, { method: 'DELETE' }))}>
                    Waiting · cancel
                  </button>
                ) : theirs ? (
                  <button
                    className="chip-btn on"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await f.act(`/api/challenges/${theirs.id}/accept`)
                        setRoom(theirs.id)
                      })
                    }
                  >
                    Play
                  </button>
                ) : (
                  <button className="chip-btn on" disabled={busy} onClick={() => challenge(fr.id)}>
                    Challenge
                  </button>
                )}
              </span>
            </div>
          )
        })}
        {s?.outgoing.map((r) => (
          <div className="lrow fr-out" key={r.id}>
            <span className="lwho">
              <b>{r.name}</b>
              <i>request sent · waiting for them</i>
            </span>
            <span className="fr-acts">
              {edit ? (
                <button className="chip-btn danger" disabled={busy} onClick={() => run(() => f.act(`/api/friends/${r.id}`, { method: 'DELETE' }))}>
                  Cancel
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      <div className="dock">
        <div className="dock-inner">
          <button className="btn ghost" onClick={onHome}>
            Back to the board
          </button>
        </div>
      </div>
    </>
  )
}

/**
 * ONE ONLINE GAME. The room's state is handed to Versus as its table.
 *
 * WHEN THE FRIEND PRESSES REMATCH FIRST, this phone is still on the series screen — perhaps still
 * watching Game 7 come in on the ticker. Switching the table under it would pull the result away
 * mid-reveal, so the finished round is HELD on screen until this phone presses Rematch too, and
 * only then does it join the new board the friend has already started on.
 */
function OnlineMatch({ id, onLeave }: { id: string; onLeave: () => void }) {
  const { room, status, error, send, rematch, report } = useRoom(id)
  const [held, setHeld] = useState<RoomState | null>(null)
  const prev = useRef<RoomState | null>(null)
  const asked = useRef(false)

  useEffect(() => {
    const p = prev.current
    if (room && p && room.round > p.round) {
      if (!asked.current && p.moves.some((m) => m.k === 'sim')) setHeld(p)
      asked.current = false
    }
    prev.current = room
  }, [room])

  if (!room || status === 'over')
    return (
      <>
        <div className="topbar">
          <span>Online · vs friend</span>
        </div>
        <div className="rule2" />
        <div className="card fr-card">
          <div className="cap hint">{status === 'over' ? (error ?? 'That game is over.') : status === 'retrying' ? 'Cannot reach the game — trying again…' : 'Joining the game…'}</div>
        </div>
        <div className="dock">
          <div className="dock-inner">
            <button className="btn ghost" onClick={onLeave}>
              Back to friends
            </button>
          </div>
        </div>
      </>
    )

  const shown = held ?? room
  return (
    <>
      <button className="map-link fr-back" onClick={onLeave}>
        ← Friends
      </button>
      <Versus
        key={shown.round}
        onHome={onLeave}
        online={{
          seat: shown.seat,
          names: shown.names,
          seed: shown.seed,
          moves: shown.moves,
          present: room.present,
          connected: !held && status === 'open',
          send,
          rematch: () => {
            if (held) setHeld(null)
            else {
              asked.current = true
              rematch()
            }
          },
          report,
        }}
      />
    </>
  )
}
