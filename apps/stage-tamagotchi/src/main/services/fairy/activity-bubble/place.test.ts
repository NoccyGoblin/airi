import { describe, expect, it } from 'vitest'

import { bubblePlace } from './place'

const area = { x: 0, y: 0, width: 1920, height: 1040 }
const bubble = { width: 240, height: 44 }

describe('bubblePlace', () => {
  it('goes centered above her when there is room', () => {
    expect(bubblePlace({ x: 800, y: 400, width: 200, height: 200 }, bubble, area)).toEqual({ x: 780, y: 352 })
  })

  it('stays on the screen near a side edge', () => {
    expect(bubblePlace({ x: 1800, y: 400, width: 120, height: 200 }, bubble, area).x).toBe(1680)
  })

  it('goes beside her, on the side with more room, at the top of the screen', () => {
    expect(bubblePlace({ x: 100, y: 10, width: 200, height: 200 }, bubble, area)).toEqual({ x: 304, y: 88 })
    expect(bubblePlace({ x: 1600, y: 10, width: 200, height: 200 }, bubble, area)).toEqual({ x: 1356, y: 88 })
  })

  it('goes below her when nothing else fits', () => {
    const narrow = { x: 0, y: 0, width: 300, height: 1040 }
    expect(bubblePlace({ x: 40, y: 0, width: 220, height: 200 }, bubble, narrow)).toEqual({ x: 30, y: 204 })
  })
})
