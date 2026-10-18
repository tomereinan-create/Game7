# Iconic-moment posters: hand-off to the design chat

Written 2026-10-19 by the moments session. Tomer's rulings, verbatim where it matters.

## The ten keepers (his list)

Every file lives in `public/moments/`, 3:4, ~1024 px wide, listed in `public/moments/manifest.json`.
The sheet that made them is `src/data/moments.json`; the reference photographs are in
`scripts/moments/refs/`. Do not regenerate any of these; he picked each one by hand.

| slug | title | the moment | tier on the sheet |
|---|---|---|---|
| `the-bounce` | The Bounce | Kawhi, 2019 Game 7, the ball on the rim at 0.0 (cathedral roof in a storm) | league |
| `the-crossover` | The Crossover | Curry drops Chris Paul, 2015 (a janitor mopping, SLIPPERY sign, anime) | league |
| `the-last-shot` | The Last Shot | Jordan over Russell, 1998, 6.6 on the clock (cathedral nave) | champions |
| `the-block` | The Block | LeBron on Iguodala, 2016 Game 7 (the backboard a slab of ice) | champions |
| `the-junior-skyhook` | The Junior Skyhook | Magic, 1987 Game 4 (stained glass) | champions |
| `the-skyhook` | The Skyhook | Kareem over Parish, 1985 (summit above the clouds) | all-time |
| `the-hundred` | One Hundred | Wilt's 100, 1962 (a Disney schoolboy showing his parents a 100) | all-time |
| `the-free-throw-line-dunk` | From the Line | Jordan, 1988 dunk contest (flying through the clouds) | customs |
| `the-stepover` | The Stepover | Iverson over Lue, 2001 (colosseum at night) | customs |
| `the-dunk-of-death` | The Dunk of Death | Carter over Weis, 2000 Olympics (graveyard at night) | customs |

Four slots on the sheet (`the-stepback`, `the-corner-three`, `the-trophy`, `the-dream-shake`) have no
picture yet and wear the typographic face; the moments session is still working on those.

## What he wants on the campaign (his words, 2026-10-19)

> "Lets make a list with all the good ones, that I want you to send to Design chat to put in the
> correct place on the campaign. Have each campaign have its own images. Images only unlock as you
> get to the stage."

So, three changes to how the ladder hangs them today:

1. **Correct place.** Each poster belongs beside the levels of its own era/tier (the `tier` column
   above), not spread evenly up the tier band as `postersFor` in `src/ui/moments.ts` does now. Put
   it where the moment "lives" on the climb.
2. **Each campaign has its own images.** The three campaign modes (Campaign, Salary cap, Death
   match) should not all show the same set. Split the ten (and the four to come) across the modes,
   or assign per mode in the sheet; he did not say how to split, so propose one and he will rule.
3. **Unlock on reaching the stage, not on clearing the tier.** Today `lit` is true only once every
   level of the tier has a star. He wants a poster to light the moment the player reaches the stage
   it hangs beside. The unlocked/sealed look itself can stay.

## What already exists (so nothing is rebuilt)

- `src/ui/moments.ts` — `postersFor(eras, rounds, stars, seam, height)` decides position and `lit`;
  `fileOf(manifest, slug)` resolves the picture. `tests/moments.test.ts` covers it.
- `src/ui/moments.css` — the gutters either side of the trail from 1280 px, the frame, sealed/lit.
- `src/ui/LevelMap.tsx` — renders `.moments` beside `.trail-room`, reads the manifest once.
- `src/data/moments.json` — the sheet; add a `mode` (or similar) field per moment for the split.

## Push rule

Main is quiet from the moments session's side once this file lands. Pull before you start; push
only when main is quiet (the handshake in memory). Run `npm run build` after merging so
localhost:5178 serves it.
