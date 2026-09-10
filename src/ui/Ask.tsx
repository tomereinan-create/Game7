import { useEffect } from 'react'

/**
 * The in-game ask (his ruling): every second look is a dialog in the game's
 * voice — dimmed veil, gold-topped card — never a browser popup, which does
 * not render on his phone. Tapping the veil or the ghost button walks away.
 *
 * WHICH BUTTON IS THE LOUD ONE (his report: "RESET IT is styled as the primary orange button,
 * identical to SPIN/DRAFT/SIM. The destructive one should be muted; GO BACK should be primary").
 * `danger` says this ask destroys something, and it swaps the two skins: the way out takes the
 * arcade gold that DRAFT and SPIN THE WHEEL wear, and the thing that cannot be undone drops to the
 * red outline. It is opt-in and off by default because not every second look is a warning — the
 * draft's "Sim without it" asks about a change you have not spent, and muting that one would tell
 * the player he is about to break something when he is not.
 *
 * The two buttons stay in the order they have always been in: GO BACK on the left, the deed on the
 * right. Colour moves the pull; moving the buttons would move the tab order and the thumb's memory
 * with it, and the same dialog shape is used for asks that are not destructive at all.
 */
export function Ask({
  label,
  text,
  yes,
  no = 'Go back',
  danger = false,
  onYes,
  onClose,
}: {
  label: string
  text: string
  yes: string
  no?: string
  danger?: boolean
  onYes: () => void
  onClose: () => void
}) {
  /* A veil you can tap is not a way out on a keyboard, and the deed is the last thing in tab order.
     Escape is the same walk-away the veil already is. */
  useEffect(() => {
    const off = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', off)
    return () => window.removeEventListener('keydown', off)
  }, [onClose])

  return (
    <div className="ask-veil" onClick={onClose}>
      <div
        className={`ask${danger ? ' danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="label">{label}</span>
        <p>{text}</p>
        <div className="ask-btns">
          <button className={danger ? 'btn' : 'btn ghost'} onClick={onClose}>
            {no}
          </button>
          <button className={danger ? 'btn danger' : 'btn'} onClick={onYes}>
            {yes}
          </button>
        </div>
      </div>
    </div>
  )
}
