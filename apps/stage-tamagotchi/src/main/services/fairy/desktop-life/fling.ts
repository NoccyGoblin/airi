/**
 * FAIRY: the flight of the character's window after the owner throws it: the speed at the release, then a glide that
 * slows down and bounces off the edges of the work area. Pure math in screen DIP and milliseconds.
 */

export interface Sample {
  x: number
  y: number
  at: number
}

export interface Flight {
  x: number
  y: number
  /** Speed in DIP per millisecond. */
  vx: number
  vy: number
}

/** Only the last part of a drag tells the speed of the throw. */
const RELEASE_WINDOW_MS = 120
/** A release faster than this is a throw. Slower is a normal drag. */
export const MIN_THROW_SPEED = 0.9
/** The flight ends below this speed. */
export const STOP_SPEED = 0.04
/** How fast the air slows her down. A larger value glides longer. */
const FRICTION_MS = 420
/** How much speed a bounce keeps. */
const BOUNCE = 0.55
/** Very fast throws are capped, so she does not cross the screen in one frame. */
const MAX_SPEED = 6

/** The speed of the window at the release, from its recent places. */
export function releaseSpeed(samples: readonly Sample[], now: number): { vx: number, vy: number } {
  const recent = samples.filter(sample => now - sample.at <= RELEASE_WINDOW_MS)
  if (recent.length < 2)
    return { vx: 0, vy: 0 }
  const first = recent[0]
  const last = recent.at(-1)!
  const elapsed = Math.max(1, last.at - first.at)
  const cap = (value: number) => Math.max(-MAX_SPEED, Math.min(MAX_SPEED, value))
  return { vx: cap((last.x - first.x) / elapsed), vy: cap((last.y - first.y) / elapsed) }
}

export function speedOf(flight: Pick<Flight, 'vx' | 'vy'>) {
  return Math.hypot(flight.vx, flight.vy)
}

/**
 * Moves the flight on by `elapsedMs`. The whole window stays in the area, and a wall turns the speed around.
 *
 * Returns:
 * - The new flight, and whether it hit a wall in this step
 */
export function flingStep(flight: Flight, elapsedMs: number, size: { width: number, height: number }, area: { x: number, y: number, width: number, height: number }) {
  const slow = Math.exp(-elapsedMs / FRICTION_MS)
  let { vx, vy } = flight
  let x = flight.x + vx * elapsedMs
  let y = flight.y + vy * elapsedMs
  let bounced = false
  const maxX = area.x + area.width - size.width
  const maxY = area.y + area.height - size.height
  if (x < area.x || x > maxX) {
    x = Math.min(maxX, Math.max(area.x, x))
    vx = -vx * BOUNCE
    bounced = true
  }
  if (y < area.y || y > maxY) {
    y = Math.min(maxY, Math.max(area.y, y))
    vy = -vy * BOUNCE
    bounced = true
  }
  return { flight: { x, y, vx: vx * slow, vy: vy * slow }, bounced }
}
