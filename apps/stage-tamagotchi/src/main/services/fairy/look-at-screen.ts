import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { LookAtScreenResult } from '../../../shared/eventa'

import { setTimeout as sleep } from 'node:timers/promises'

import { defineInvokeHandler } from '@moeru/eventa'
import { BrowserWindow, desktopCapturer, screen } from 'electron'

import { electronLookAtScreen } from '../../../shared/eventa'

/**
 * The longest side of the screenshot. 1600 keeps normal text readable for a local vision model, and needs about a third
 * fewer image tokens than full HD, so the read is faster.
 */
const MAX_SIDE = 1600
/** Windows needs a moment before a window that turned on content protection disappears from captures. */
const HIDE_DELAY_MS = 120

/**
 * "Look at my screen": takes ONE screenshot of the display under `window`, only when the renderer asks.
 *
 * Privacy: the image stays in memory and goes back to the renderer, which attaches it to the next chat message for the
 * local models. Nothing is saved to disk here and nothing runs on a timer.
 *
 * AIRI's own windows (the fairy, the chat) are hidden from the capture with content protection while it runs, so they do
 * not cover what the user wants to show.
 */
export async function lookAtScreen(window: BrowserWindow): Promise<LookAtScreenResult> {
  const display = screen.getDisplayMatching(window.getBounds())
  const { width, height } = display.size
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height)) * display.scaleFactor
  const thumbnailSize = { width: Math.round(width * scale), height: Math.round(height * scale) }

  const ownWindows = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed())
  for (const w of ownWindows)
    w.setContentProtection(true)

  try {
    await sleep(HIDE_DELAY_MS)
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
    const source = sources.find(s => s.display_id === String(display.id)) ?? sources[0]
    if (!source || source.thumbnail.isEmpty())
      throw new Error('Could not capture the screen.')

    // Shrink to MAX_SIDE when the display is scaled, so the image keeps its real proportions.
    let image = source.thumbnail
    const size = image.getSize()
    if (Math.max(size.width, size.height) > MAX_SIDE)
      image = image.resize(size.width >= size.height ? { width: MAX_SIDE } : { height: MAX_SIDE })

    return { mimeType: 'image/jpeg', data: image.toJPEG(85).toString('base64') }
  }
  finally {
    for (const w of ownWindows) {
      if (!w.isDestroyed())
        w.setContentProtection(false)
    }
  }
}

export function createLookAtScreenService(params: {
  context: ReturnType<typeof createContext>['context']
  window: BrowserWindow
}): void {
  defineInvokeHandler(params.context, electronLookAtScreen, () => lookAtScreen(params.window))
}
