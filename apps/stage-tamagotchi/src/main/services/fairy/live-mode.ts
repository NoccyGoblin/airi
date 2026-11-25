import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { electronLiveModeTick } from '../../../shared/eventa'

/** How often the main window checks whether live mode has something to do. */
export const LIVE_MODE_TICK_MS = 10_000

/**
 * FAIRY: sends the live mode beat to the main window only, so exactly one window runs live mode.
 *
 * Returns:
 * - A function that stops the beat
 */
export function createLiveModeTicker(params: { context: ReturnType<typeof createContext>['context'] }) {
  const timer = setInterval(() => params.context.emit(electronLiveModeTick, undefined), LIVE_MODE_TICK_MS)
  return () => clearInterval(timer)
}
