/**
 * THE MARK — the game's own ball with the 7 through it, drawn in CSS rather than shipped as a
 * raster (public/icon-512.png is the reference, not the asset). Leather is a radial gradient, the
 * four seams are gradient-faded so the 7 reads through the middle of them, and THE MARK never
 * rotates: the 7 has to stay upright, which is why `dribble` only moves it on y.
 *
 * `plain` DRAWS THE SAME LEATHER WITHOUT THE 7, and it is what makes the rule above a rule about the
 * 7 rather than about the ball. The front door throws one of these across its floor at fourteen
 * pixels on a phone, where a numeral is mud, and it SPINS on the way — which is what a thrown ball
 * does and exactly what the mark must not. No 7 on it, so there is nothing to keep upright.
 *
 * Size is the one other prop. Everything inside is drawn in ems of it, so 62 on the front door and
 * 30 in the header are the same drawing. It takes a CSS length as well as a number, so a caller that
 * wants the mark to grow with its window can hand it a clamp() instead of a fixed pixel count.
 */
export function Ball({
  size = 62,
  dribble = false,
  plain = false,
  className = '',
}: {
  size?: number | string
  dribble?: boolean
  plain?: boolean
  className?: string
}) {
  return (
    <span className={`ball7 ${dribble ? 'dribble' : ''} ${className}`} style={{ width: size, height: size, fontSize: size }} aria-hidden>
      <i className="seam-v" />
      <i className="seam-h" />
      <i className="seam-c" />
      {plain ? null : <b>7</b>}
    </span>
  )
}
