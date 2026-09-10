/**
 * THE MARK — the game's own ball with the 7 through it, drawn in CSS rather than shipped as a
 * raster (public/icon-512.png is the reference, not the asset). Leather is a radial gradient, the
 * four seams are gradient-faded so the 7 reads through the middle of them, and THE 7 IS ON EVERY
 * BALL THIS APP DRAWS — his ruling of 2026-09-10, verbatim: "Photo number 3, We have 2 squares,
 * just make the court bigger to fit the outer square, and add 7 to the basketball".
 *
 * TOMBSTONE — `plain`, the prop that drew this leather WITHOUT the 7. It existed for exactly one
 * call site, the ball on the front door's floor, on the argument that a numeral is mud at fourteen
 * pixels and that a ball which TURNS has nothing to keep upright. His ruling reverses both halves
 * of it, and the same ruling widens that floor enough that the ball on it is 22px at 375 rather
 * than 11 — so the option is deleted rather than left in the signature as a choice nobody may take.
 *
 * `dribble` moves the mark on y only, and that rule outlived the prop: the 7 has to stay upright,
 * so the header's mark bounces and never rotates. The front door's ball is the one that turns, and
 * it turns on its own rule in the stylesheet, which is what a ball rolling along a floor does.
 *
 * Size is the one other prop. Everything inside is drawn in ems of it, so 62 on the front door and
 * 30 in the header are the same drawing. It takes a CSS length as well as a number, so a caller that
 * wants the mark to grow with its window can hand it a clamp() instead of a fixed pixel count.
 */
export function Ball({
  size = 62,
  dribble = false,
  className = '',
}: {
  size?: number | string
  dribble?: boolean
  className?: string
}) {
  return (
    <span className={`ball7 ${dribble ? 'dribble' : ''} ${className}`} style={{ width: size, height: size, fontSize: size }} aria-hidden>
      <i className="seam-v" />
      <i className="seam-h" />
      <i className="seam-c" />
      <b>7</b>
    </span>
  )
}
