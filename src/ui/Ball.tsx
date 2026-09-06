/**
 * THE MARK — the game's own ball with the 7 through it, drawn in CSS rather than shipped as a
 * raster (public/icon-512.png is the reference, not the asset). Leather is a radial gradient, the
 * four seams are gradient-faded so the 7 reads through the middle of them, and the ball NEVER
 * rotates: the 7 has to stay upright, which is why `dribble` only moves it on y.
 *
 * Size is the one prop. Everything inside is drawn in ems of it, so 62 on the front door and 30
 * in the header are the same drawing.
 */
export function Ball({ size = 62, dribble = false, className = '' }: { size?: number; dribble?: boolean; className?: string }) {
  return (
    <span className={`ball7 ${dribble ? 'dribble' : ''} ${className}`} style={{ width: size, height: size, fontSize: size }} aria-hidden>
      <i className="seam-v" />
      <i className="seam-h" />
      <i className="seam-c" />
      <b>7</b>
    </span>
  )
}
