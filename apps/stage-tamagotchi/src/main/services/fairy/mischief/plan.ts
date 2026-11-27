/**
 * FAIRY: which prank comes next and when. Pure, so it is easy to test.
 */

export const PRANKS = ['hide', 'tug', 'popup', 'doodle', 'note'] as const
export type Prank = typeof PRANKS[number]

/** The pause between two pranks, in a random time between the two. */
export const PRANK_GAP_MS = [10 * 60_000, 25 * 60_000] as const

export function nextPrankAt(now: number, random: () => number = Math.random) {
  return now + PRANK_GAP_MS[0] + random() * (PRANK_GAP_MS[1] - PRANK_GAP_MS[0])
}

/**
 * A random prank that is not the last one. A cursor tug is left out when the pointer may not move, for example in a
 * game.
 */
export function pickPrank(last: Prank | undefined, options: { tugAllowed: boolean }, random: () => number = Math.random): Prank {
  const choices = PRANKS.filter(prank => prank !== last && (prank !== 'tug' || options.tugAllowed))
  return choices[Math.floor(random() * choices.length)]
}

/** Small doodles for the doodle prank. Plain shapes only, so they pass the doodle check. */
export const PRANK_DOODLES = [
  // A curly mustache.
  '<svg viewBox="0 0 400 400"><path d="M200 210 C170 170 110 170 90 210 C80 240 120 250 130 225"/><path d="M200 210 C230 170 290 170 310 210 C320 240 280 250 270 225"/></svg>',
  // A heart.
  '<svg viewBox="0 0 400 400"><path d="M200 330 C80 250 60 160 120 120 C160 95 195 120 200 150 C205 120 240 95 280 120 C340 160 320 250 200 330 Z"/></svg>',
  // A smiley face with a tongue out.
  '<svg viewBox="0 0 400 400"><circle cx="200" cy="200" r="140"/><circle cx="150" cy="170" r="14"/><circle cx="250" cy="170" r="14"/><path d="M130 240 Q200 300 270 240"/><path d="M185 262 Q200 310 215 262"/></svg>',
  // A star.
  '<svg viewBox="0 0 400 400"><polygon points="200,50 240,160 355,160 262,228 298,340 200,272 102,340 138,228 45,160 160,160"/></svg>',
]
