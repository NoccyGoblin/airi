import { describe, expect, it } from 'vitest'

import { flingStep, MIN_THROW_SPEED, releaseSpeed, speedOf, STOP_SPEED } from './fling'

const area = { x: 0, y: 0, width: 1920, height: 1040 }
const size = { width: 200, height: 200 }

describe('releaseSpeed', () => {
  it('measures the speed of the last part of the drag', () => {
    const samples = [{ x: 0, y: 0, at: 0 }, { x: 100, y: 0, at: 400 }, { x: 200, y: 50, at: 450 }, { x: 300, y: 100, at: 500 }]
    expect(releaseSpeed(samples, 500)).toEqual({ vx: 2, vy: 1 })
  })

  it('is zero for a slow or old drag', () => {
    expect(speedOf(releaseSpeed([{ x: 0, y: 0, at: 0 }, { x: 10, y: 0, at: 100 }], 100))).toBeLessThan(MIN_THROW_SPEED)
    expect(releaseSpeed([{ x: 0, y: 0, at: 0 }, { x: 500, y: 0, at: 50 }], 1000)).toEqual({ vx: 0, vy: 0 })
  })
})

describe('flingStep', () => {
  it('slows down until the flight stops', () => {
    let flight = { x: 800, y: 400, vx: 2, vy: 0 }
    let steps = 0
    while (speedOf(flight) > STOP_SPEED && steps < 1000) {
      flight = flingStep(flight, 16, size, area).flight
      steps++
    }
    expect(steps).toBeLessThan(200)
    expect(flight.x).toBeGreaterThan(1000)
  })

  it('bounces off a wall and stays inside', () => {
    const { flight, bounced } = flingStep({ x: 1700, y: 400, vx: 3, vy: 0 }, 16, size, area)
    expect(bounced).toBe(true)
    expect(flight.x).toBe(1720)
    expect(flight.vx).toBeLessThan(0)
  })
})
