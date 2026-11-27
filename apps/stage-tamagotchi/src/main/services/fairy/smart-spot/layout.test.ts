import { describe, expect, it } from 'vitest'

import { bestSpot, menuGrid, spotCost } from './layout'

const WIDTH = 160
const HEIGHT = 96

/**
 * A fake game: the world is random noise that changes each frame, and a menu is a still checkerboard in the
 * bottom right corner, from x 112 and y 64.
 */
function frame(seed: number) {
  let state = seed
  const random = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648
  const data = new Uint8Array(WIDTH * HEIGHT * 4)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const menu = x >= 112 && y >= 64
      const value = menu ? ((x >> 1) + (y >> 1)) % 2 * 200 : random() * 255
      data.set([value, value, value, 255], (y * WIDTH + x) * 4)
    }
  }
  return { width: WIDTH, height: HEIGHT, data }
}

describe('menuGrid', () => {
  it('marks still, detailed areas as menu, and the moving world as free', () => {
    const grid = menuGrid([frame(1), frame(2), frame(3)])
    expect(grid.score[9 * grid.cols + 18]).toBeGreaterThan(0.9)
    expect(grid.score[2 * grid.cols + 3]).toBeLessThan(0.1)
  })

  it('treats a flat, still area as free', () => {
    const flat = { width: WIDTH, height: HEIGHT, data: new Uint8Array(WIDTH * HEIGHT * 4).fill(40) }
    expect(Math.max(...menuGrid([flat, flat]).score)).toBe(0)
  })
})

describe('bestSpot', () => {
  const grid = menuGrid([frame(1), frame(2), frame(3)])
  const display = { width: 1600, height: 960 }
  const size = { width: 200, height: 200 }

  it('moves off the menu to an edge', () => {
    const from = { x: 1300, y: 700 }
    expect(spotCost(grid, display, { ...from, ...size }, from).menu).toBeGreaterThan(0.9)
    const spot = bestSpot(grid, display, size, from)
    expect(spot.menu).toBeLessThan(0.05)
    const edge = Math.min(spot.x, spot.y, display.width - spot.x - size.width, display.height - spot.y - size.height)
    expect(edge).toBeLessThan(60)
  })
})
