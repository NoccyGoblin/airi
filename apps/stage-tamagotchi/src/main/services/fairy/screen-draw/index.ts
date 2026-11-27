import type { Display, Rectangle } from 'electron'

import { BrowserWindow, screen } from 'electron'

import { markClickThrough } from '../activity-bubble'
import { DRAW_PAGE } from './page'

/**
 * FAIRY: a see-through layer over one screen, where the character draws marks and doodles that fade away. It lets
 * every click through, never takes the focus, and screenshots of the character leave it out like her other windows.
 */

/** How long a drawing stays before it fades. */
const HOLD_MS = 6_000
/** The layer hides a while after the last drawing faded. */
const HIDE_AFTER_MS = HOLD_MS + 2_000

let layer: { window: BrowserWindow, display: number, ready: Promise<void> } | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined

async function layerOn(display: Display) {
  if (!layer || layer.window.isDestroyed() || layer.display !== display.id) {
    layer?.window.destroy()
    const window = new BrowserWindow({
      ...display.bounds,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      enableLargerThanScreen: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    })
    markClickThrough(window)
    window.setIgnoreMouseEvents(true)
    window.setAlwaysOnTop(true, 'screen-saver')
    layer = { window, display: display.id, ready: window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(DRAW_PAGE)}`).then(() => {}, () => {}) }
  }
  await layer.ready
  layer.window.setBounds(display.bounds)
  if (!layer.window.isVisible())
    layer.window.showInactive()
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => layer?.window.isDestroyed() === false && layer.window.hide(), HIDE_AFTER_MS)
  return layer.window
}

/** Draws a circle around a point on the screen, given in DIP, with an optional short label. */
export async function drawMark(point: { x: number, y: number }, radius: number, label?: string) {
  const display = screen.getDisplayNearestPoint(point)
  const window = await layerOn(display)
  const spec = { x: point.x - display.bounds.x, y: point.y - display.bounds.y, radius, label: label?.slice(0, 40), holdMs: HOLD_MS }
  await window.webContents.executeJavaScript(`window.drawMark(${JSON.stringify(spec)})`)
}

/**
 * Draws a doodle into a box on the screen, given in DIP.
 *
 * Returns:
 * - Whether the page could read the SVG
 */
export async function drawDoodle(svg: string, box: Rectangle) {
  const display = screen.getDisplayMatching(box)
  const window = await layerOn(display)
  const spec = { svg, box: { x: box.x - display.bounds.x, y: box.y - display.bounds.y, width: box.width, height: box.height }, holdMs: HOLD_MS + 2_000 }
  return Boolean(await window.webContents.executeJavaScript(`window.drawDoodle(${JSON.stringify(spec)})`))
}

export function closeDrawingLayer() {
  clearTimeout(hideTimer)
  layer?.window.destroy()
  layer = undefined
}
