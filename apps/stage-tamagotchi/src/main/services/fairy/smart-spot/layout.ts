/**
 * FAIRY: finds the menus and the HUD of a game or a full-screen app in a few small screenshots, and picks a spot for
 * the character that keeps them free.
 *
 * Menus, action bars, and minimaps hold detail and stay the same from frame to frame. The game world moves, and an
 * empty area has no detail. So a cell of the screen counts as menu when it is detailed and still.
 */

/** One screenshot as BGRA pixels, as Electron's `NativeImage.toBitmap()` gives it. */
export interface Frame {
  width: number
  height: number
  data: Uint8Array
}

/** How much each cell of the screen looks like a menu, from 0 to 1. */
export interface MenuGrid {
  cols: number
  rows: number
  /** The side of one cell, in frame pixels. */
  cell: number
  /** The width of the frames, to scale the grid to the display. */
  frameWidth: number
  score: Float32Array
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export const CELL = 8
/** Mean brightness steps between neighbor pixels. Flat areas stay under the low end. */
const DETAIL = [4, 14] as const
/** Mean brightness change of a pixel between two frames. Menus stay under the low end. */
const CHANGE = [1.5, 8] as const

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function brightness(frame: Frame) {
  const out = new Float32Array(frame.width * frame.height)
  for (let index = 0; index < out.length; index++) {
    const at = index * 4
    out[index] = 0.114 * frame.data[at] + 0.587 * frame.data[at + 1] + 0.299 * frame.data[at + 2]
  }
  return out
}

/**
 * Scores each cell of the screen. The frames must have the same size and come a moment apart.
 *
 * @example
 * menuGrid([before, now]).score // 1 where a still, detailed menu is
 */
export function menuGrid(frames: Frame[], cell = CELL): MenuGrid {
  const { width, height } = frames[0]
  const lights = frames.map(brightness)
  const last = lights.at(-1)!
  const cols = Math.floor(width / cell)
  const rows = Math.floor(height / cell)
  const score = new Float32Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let detail = 0
      let change = 0
      let pixels = 0
      for (let y = row * cell; y < (row + 1) * cell; y++) {
        for (let x = col * cell; x < (col + 1) * cell; x++) {
          const at = y * width + x
          detail += Math.abs(last[at] - last[Math.min(at + 1, y * width + width - 1)]) + Math.abs(last[at] - last[Math.min(at + width, last.length - 1)])
          for (let frame = 1; frame < lights.length; frame++)
            change += Math.abs(lights[frame][at] - lights[frame - 1][at])
          pixels++
        }
      }
      detail /= pixels
      change /= pixels * Math.max(1, lights.length - 1)
      score[row * cols + col] = clamp01((detail - DETAIL[0]) / (DETAIL[1] - DETAIL[0])) * (1 - clamp01((change - CHANGE[0]) / (CHANGE[1] - CHANGE[0])))
    }
  }
  return { cols, rows, cell, frameWidth: width, score }
}

/** The mean menu score under a box on the display. */
function menuUnder(grid: MenuGrid, display: { width: number }, box: Box) {
  const perPixel = grid.frameWidth / display.width / grid.cell
  const col0 = Math.max(0, Math.floor(box.x * perPixel))
  const row0 = Math.max(0, Math.floor(box.y * perPixel))
  const col1 = Math.min(grid.cols, Math.ceil((box.x + box.width) * perPixel))
  const row1 = Math.min(grid.rows, Math.ceil((box.y + box.height) * perPixel))
  let sum = 0
  let count = 0
  for (let row = row0; row < row1; row++) {
    for (let col = col0; col < col1; col++) {
      sum += grid.score[row * grid.cols + col]
      count++
    }
  }
  return count ? sum / count : 0
}

/**
 * How bad a spot is: covering a menu costs most, then sitting in the middle of the action, then a long move.
 * Box positions are relative to the display.
 */
export function spotCost(grid: MenuGrid, display: { width: number, height: number }, box: Box, from: { x: number, y: number }) {
  const menu = menuUnder(grid, display, box)
  const edge = Math.min(box.x, box.y, display.width - box.x - box.width, display.height - box.y - box.height)
  const middle = clamp01(edge / (Math.min(display.width, display.height) / 2))
  const move = Math.hypot(box.x - from.x, box.y - from.y) / Math.hypot(display.width, display.height)
  return { menu, cost: menu * 10 + middle * 3 + move }
}

/**
 * The best spot for her window on the display, relative to the display.
 *
 * @example
 * bestSpot(grid, { width: 1920, height: 1080 }, { width: 208, height: 210 }, { x: 1700, y: 850 })
 */
export function bestSpot(grid: MenuGrid, display: { width: number, height: number }, size: { width: number, height: number }, from: { x: number, y: number }) {
  const step = Math.max(8, Math.round(display.width / grid.cols))
  let best = { x: from.x, y: from.y, ...spotCost(grid, display, { ...from, ...size }, from) }
  for (let y = 0; y + size.height <= display.height; y += step) {
    for (let x = 0; x + size.width <= display.width; x += step) {
      const spot = spotCost(grid, display, { x, y, ...size }, from)
      if (spot.cost < best.cost)
        best = { x, y, ...spot }
    }
  }
  return best
}
