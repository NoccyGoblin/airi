import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type { LiveModeFrame } from '../../../shared/eventa'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'

import { electronLiveModeLatestFrame, electronLiveModeSetActive, electronLiveModeTick } from '../../../shared/eventa'
import { captureDisplay, setWindowsOutOfCaptures } from './look-at-screen'

type MainContext = ReturnType<typeof createContext>['context']

/** How often the main window decides whether the character looks or talks. */
export const LIVE_MODE_TICK_MS = 3_000
/** How often live mode captures the screen. */
export const LIVE_MODE_CAPTURE_MS = 1_000

const log = useLogg('fairy-live-mode').useGlobalConfig()

/**
 * FAIRY: live mode in the main process.
 *
 * While the owner has live mode on, the screen under the main window is captured every second. Only the newest capture
 * is kept, in memory. Nothing is saved to disk and nothing leaves the PC here. The renderer decides when the character
 * sees a capture.
 */
let latest: LiveModeFrame | undefined
let captureTimer: ReturnType<typeof setInterval> | undefined
let capturing = false

function stopCapture() {
  clearInterval(captureTimer)
  captureTimer = undefined
  latest = undefined
  setWindowsOutOfCaptures(false)
}

function startCapture(window: BrowserWindow) {
  if (captureTimer)
    return
  setWindowsOutOfCaptures(true)
  const capture = async () => {
    if (capturing || window.isDestroyed())
      return
    capturing = true
    try {
      const at = Date.now()
      latest = { ...await captureDisplay(window), at }
    }
    catch (error) {
      log.warn(`live capture failed: ${errorMessageFrom(error)}`)
    }
    finally {
      capturing = false
    }
  }
  captureTimer = setInterval(() => void capture(), LIVE_MODE_CAPTURE_MS)
  void capture()
  log.log('live mode on: capturing the screen every second, in memory only')
}

/**
 * Sends the live mode beat to the main window only, so exactly one window runs live mode, and lets it start and stop
 * the capture.
 *
 * Returns:
 * - A function that stops the beat and the capture
 */
export function createLiveModeService(params: { context: MainContext, window: BrowserWindow }) {
  defineInvokeHandler(params.context, electronLiveModeSetActive, ({ active }) => {
    if (active) {
      startCapture(params.window)
    }
    else if (captureTimer) {
      stopCapture()
      log.log('live mode off')
    }
  })
  const timer = setInterval(() => params.context.emit(electronLiveModeTick, undefined), LIVE_MODE_TICK_MS)
  return () => {
    clearInterval(timer)
    stopCapture()
  }
}

/** Lets any window read the newest live capture, for example the chat window when the owner sends a message. */
export function createLiveModeFrameService(params: { context: MainContext }) {
  defineInvokeHandler(params.context, electronLiveModeLatestFrame, () => latest)
}
