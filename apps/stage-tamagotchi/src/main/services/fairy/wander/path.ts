/**
 * FAIRY: the path of the character's window in wander mode: where she flies next and where she is on the way.
 * Pure math, so it is easy to test. All values are in screen DIP.
 */

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** She flies at least this far, so a move does not look like a twitch. */
const MIN_DISTANCE = 160
/** She flies at most this far, so she does not cross the whole screen at once. */
const MAX_DISTANCE = 700

/**
 * Picks a spot in the work area where the whole window fits, at a pleasant distance from where she is.
 * `random` returns numbers in [0, 1), so tests can pass a fixed sequence.
 */
export function nextSpot(from: Point, size: { width: number, height: number }, area: Area, random: () => number = Math.random): Point {
  const maxX = area.x + Math.max(0, area.width - size.width)
  const maxY = area.y + Math.max(0, area.height - size.height)
  const clamp = (point: Point) => ({ x: Math.round(Math.min(maxX, Math.max(area.x, point.x))), y: Math.round(Math.min(maxY, Math.max(area.y, point.y))) })
  let best = clamp(from)
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = random() * Math.PI * 2
    const distance = MIN_DISTANCE + random() * (MAX_DISTANCE - MIN_DISTANCE)
    const spot = clamp({ x: from.x + Math.cos(angle) * distance, y: from.y + Math.sin(angle) * distance })
    best = spot
    if (Math.hypot(spot.x - from.x, spot.y - from.y) >= MIN_DISTANCE)
      return spot
  }
  return best
}

/** Smooth start and stop. */
function easeInOut(progress: number) {
  return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2
}

/** How high the gentle up and down bob goes, in DIP. */
export const BOB_HEIGHT = 6
/** One bob up and down takes this long. */
const BOB_PERIOD_MS = 2400

/**
 * Where she is at `elapsedMs` of a flight from `from` to `to` that lasts `durationMs`, with a soft bob on top.
 * `clockMs` drives the bob, so it keeps its rhythm between flights.
 */
export function flightPoint(from: Point, to: Point, elapsedMs: number, durationMs: number, clockMs: number): Point {
  const progress = easeInOut(Math.min(1, Math.max(0, elapsedMs / durationMs)))
  // A slight arc makes the flight look like flying, not sliding.
  const arc = Math.sin(progress * Math.PI) * Math.min(40, Math.hypot(to.x - from.x, to.y - from.y) * 0.08)
  const bob = Math.sin(clockMs / BOB_PERIOD_MS * Math.PI * 2) * BOB_HEIGHT
  return {
    x: Math.round(from.x + (to.x - from.x) * progress),
    y: Math.round(from.y + (to.y - from.y) * progress - arc + bob),
  }
}

/** A flight lasts longer for a longer way, between 2 and 5 seconds. */
export function flightDuration(from: Point, to: Point) {
  return Math.round(Math.min(5000, Math.max(2000, Math.hypot(to.x - from.x, to.y - from.y) * 6)))
}
