/**
 * THE TROPHY (his ruling: "Add a trophy in all modes after 150 wins").
 *
 * Drawn, not typed: the emoji cup is a different object in every font the game can land in — a
 * flat gold outline on a phone, a shaded 3D render on a desk — and this one has to sit beside the
 * ★ the whole map is scored in and read as the same set of marks. One path in `currentColor`, so
 * the four map skins and the front door each light it in their own gold without a copy of it.
 *
 * Used in two places and no more: across the top of a finished campaign's map, and on the front
 * door beside whichever of the three modes has been finished.
 */
export function Trophy({ size = 26 }: { size?: number }) {
  return (
    <svg className="trophy" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {/* the cup — the bowl, and the two handles it is carried by */}
      <path
        d="M7 3h10v6a5 5 0 0 1-10 0V3Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7 4.5H4.5V6a3.5 3.5 0 0 0 2.9 3.45" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M17 4.5h2.5V6a3.5 3.5 0 0 1-2.9 3.45" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      {/* the stem and the plinth */}
      <path d="M12 14v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.5 21h7l-1-3.5h-5l-1 3.5Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
