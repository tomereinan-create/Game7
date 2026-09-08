import { useId } from 'react'

/**
 * THE TROPHY (his ruling, 2026-09-08: "Add a trophy for EVERY mode at 150 wins(An actual golden
 * trophy at the end)").
 *
 * Drawn, not typed: the emoji cup is a different object in every font the game can land in — a
 * flat outline on a phone, a shaded render on a desk — and this one has to stand at the head of a
 * ladder that took a hundred and fifty series to climb.
 *
 * "AN ACTUAL GOLDEN TROPHY" is the whole brief, and it is what changed here. It used to be thin
 * line-art in `currentColor`: a bowl, two hooks, a plinth, one flat colour, an ICON of a cup. It
 * is MODELLED and LIT now — a bowl that turns away from the light, handles with a near and a far
 * side, a stem, a collar and a two-tier base, and gold that carries a highlight, a core shadow and
 * a bounce off the floor rather than one fill. That is what makes it read as a real object at the
 * end of the trail instead of a symbol for one.
 *
 * IT CARRIES ITS OWN GOLD, which is the one thing the old icon did differently. Shading cannot be
 * inherited — `currentColor` is a single value and a lit object needs five — so the cup no longer
 * takes its colour from the box it stands in. The two STATES it has to have are done in CSS with a
 * filter instead: dim and unsaturated while the ladder is unfinished (it is the thing being
 * climbed towards), full gold once every level has fallen. See `.map-crown` in styles.css.
 *
 * The gradients are given ids off `useId`, because the front door draws one of these per finished
 * mode and duplicate ids in a document are a lottery over which defs win.
 *
 * Used in two places and no more: at the head of a finished campaign's trail, and on the front
 * door beside whichever of the three modes has been finished.
 */
export function Trophy({ size = 26 }: { size?: number }) {
  const uid = useId()
  const cup = `tr-cup-${uid}`
  const rim = `tr-rim-${uid}`
  const hand = `tr-hand-${uid}`
  const base = `tr-base-${uid}`
  return (
    <svg className="trophy" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        {/* The bowl, across the light: a lit left shoulder, a dark core where it turns away, a
            bounce back up the right side, and the foot of it in shadow. Five stops is the minimum
            that reads as metal — three of them and it is a plastic ramp. */}
        <linearGradient id={cup} x1="5" y1="3" x2="27" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="0.2" stopColor="#f6d788" />
          <stop offset="0.44" stopColor="#dda63c" />
          <stop offset="0.62" stopColor="#9c6a1a" />
          <stop offset="0.8" stopColor="#e9c46a" />
          <stop offset="1" stopColor="#7a5014" />
        </linearGradient>
        {/* The rim is seen nearly edge-on, so it is lit from both ends and dark in the middle. */}
        <linearGradient id={rim} x1="6" y1="0" x2="26" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff4cd" />
          <stop offset="0.35" stopColor="#d9a441" />
          <stop offset="0.62" stopColor="#8f6018" />
          <stop offset="1" stopColor="#ffeec0" />
        </linearGradient>
        {/* A handle is a rod bent round: bright where it faces the light, dark on the return. */}
        <linearGradient id={hand} x1="0" y1="6" x2="0" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe9b4" />
          <stop offset="0.5" stopColor="#cf9a34" />
          <stop offset="1" stopColor="#8a5c16" />
        </linearGradient>
        {/* The base is lit from above and sits in its own shadow. */}
        <linearGradient id={base} x1="0" y1="23" x2="0" y2="31" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f4d68f" />
          <stop offset="0.45" stopColor="#c08f2c" />
          <stop offset="1" stopColor="#6d4712" />
        </linearGradient>
      </defs>

      {/* THE HANDLES, behind the bowl so they read as passing round the back of it */}
      <path
        d="M7.1 7.6C2.9 7.6 1.5 10 2.4 12.3c0.9 2.3 3.3 3.6 6.3 4.1"
        stroke={`url(#${hand})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M24.9 7.6c4.2 0 5.6 2.4 4.7 4.7-0.9 2.3-3.3 3.6-6.3 4.1"
        stroke={`url(#${hand})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* THE BOWL — the rim's width at the top, tapering to a rounded foot */}
      <path d="M6.9 5.6C6.9 14.2 10.3 19.7 16 20.8c5.7-1.1 9.1-6.6 9.1-15.2Z" fill={`url(#${cup})`} />
      {/* the core shadow down the right of the bowl, so the turn is a turn and not a gradient */}
      <path d="M19.4 5.6c0 7.3-1.2 12.3-3.4 15.2 5.7-1.1 9.1-6.6 9.1-15.2Z" fill="#5f3d0d" fillOpacity="0.22" />
      {/* the sheen: the one bright streak that says polished metal */}
      <path d="M10.6 6.8C10.6 12.6 11.7 16.6 13.8 19" stroke="#fffaea" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* THE RIM, an ellipse over the bowl's mouth, with the dark of the inside inside it */}
      <ellipse cx="16" cy="5.6" rx="9.1" ry="2.4" fill={`url(#${rim})`} />
      <ellipse cx="16" cy="5.8" rx="7" ry="1.4" fill="#4a2f08" fillOpacity="0.6" />
      <ellipse cx="16" cy="5.8" rx="7" ry="1.4" fill={`url(#${cup})`} fillOpacity="0.35" />

      {/* THE STEM, flaring into the collar */}
      <path d="M14.1 20.2c0 2-0.5 3.2-1.4 4.2h6.6c-0.9-1-1.4-2.2-1.4-4.2Z" fill={`url(#${cup})`} />
      <rect x="11.5" y="24.2" width="9" height="2.3" rx="1.1" fill={`url(#${base})`} />

      {/* THE BASE, a riser and a slab under it */}
      <path d="M10.9 26.5h10.2l1.5 2.2H9.4Z" fill={`url(#${base})`} />
      <rect x="6.8" y="28.5" width="18.4" height="2.9" rx="1.2" fill={`url(#${base})`} />
      {/* the one lit edge along the top of the slab — a base with no top light reads as a hole */}
      <rect x="7.6" y="28.7" width="16.8" height="0.7" rx="0.35" fill="#ffedbd" fillOpacity="0.5" />
    </svg>
  )
}
