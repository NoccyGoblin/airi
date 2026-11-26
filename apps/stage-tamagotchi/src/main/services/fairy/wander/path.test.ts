import { describe, expect, it } from 'vitest'

import { BOB_HEIGHT, flightDuration, flightPoint, nextSpot } from './path'

const area = { x: 0, y: 0, width: 1920, height: 1040 }
const size = { width: 200, height: 200 }

/** A fixed sequence of random numbers. */
function sequence(...values: number[]) {
  let index = 0
  return () => values[index++ % values.length]
}

describe('nextSpot', () => {
  it('keeps the whole window in the work area', () => {
    for (let seed = 0; seed < 50; seed++) {
      const spot = nextSpot({ x: 1700, y: 820 }, size, area, sequence((seed * 0.137) % 1, (seed * 0.731) % 1))
      expect(spot.x).toBeGreaterThanOrEqual(0)
      expect(spot.y).toBeGreaterThanOrEqual(0)
      expect(spot.x).toBeLessThanOrEqual(1720)
      expect(spot.y).toBeLessThanOrEqual(840)
    }
  })

  it('flies a real distance', () => {
    const from = { x: 800, y: 400 }
    const spot = nextSpot(from, size, area, sequence(0.25, 0.5))
    expect(Math.hypot(spot.x - from.x, spot.y - from.y)).toBeGreaterThanOrEqual(160)
  })

  it('works on a second screen left of the first', () => {
    const left = { x: -1920, y: 0, width: 1920, height: 1040 }
    const spot = nextSpot({ x: -1000, y: 300 }, size, left, sequence(0.1, 0.9))
    expect(spot.x).toBeLessThanOrEqual(-200)
  })
})

describe('flightPoint', () => {
  it('starts at the start and ends at the target, apart from the bob', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 500, y: 300 }
    const start = flightPoint(from, to, 0, 3000, 0)
    const end = flightPoint(from, to, 3000, 3000, 0)
    expect(start).toEqual({ x: 0, y: 0 })
    expect(end.x).toBe(500)
    expect(Math.abs(end.y - 300)).toBeLessThanOrEqual(BOB_HEIGHT)
  })
})

describe('flightDuration', () => {
  it('stays between 2 and 5 seconds', () => {
    expect(flightDuration({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(2000)
    expect(flightDuration({ x: 0, y: 0 }, { x: 5000, y: 0 })).toBe(5000)
  })
})
