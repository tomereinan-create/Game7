/**
 * The in-game ask (his ruling): every second look is a dialog in the game's
 * voice — dimmed veil, gold-topped card — never a browser popup, which does
 * not render on his phone. Tapping the veil or the ghost button walks away.
 */
export function Ask({
  label,
  text,
  yes,
  no = 'Go back',
  onYes,
  onClose,
}: {
  label: string
  text: string
  yes: string
  no?: string
  onYes: () => void
  onClose: () => void
}) {
  return (
    <div className="ask-veil" onClick={onClose}>
      <div className="ask" onClick={(e) => e.stopPropagation()}>
        <span className="label">{label}</span>
        <p>{text}</p>
        <div className="ask-btns">
          <button className="btn ghost" onClick={onClose}>
            {no}
          </button>
          <button className="btn" onClick={onYes}>
            {yes}
          </button>
        </div>
      </div>
    </div>
  )
}
