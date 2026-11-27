import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type { Point } from './path'

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { screen } from 'electron'
import { boolean, object, optional, parse } from 'valibot'

import { electronWanderMode } from '../../../../shared/eventa'
import { FAIRY_DATA_DIR } from '../memory-files'
import { flightDuration, flightPoint, nextSpot } from './path'

/**
 * FAIRY: wander mode. The character's window floats from spot to spot on the screen with a soft bob. She holds still
 * while the mouse is on her, so the owner can always grab her, and a drag by the owner becomes her new spot.
 */

const SETTINGS_FILE = join(FAIRY_DATA_DIR, 'wander.json')
const settingsSchema = object({ enabled: optional(boolean(), false) })
const log = useLogg('fairy-wander').useGlobalConfig()

/** Reasons that hold wander mode still for a while, for example a throw or a nap. */
const pauses = new Set<string>()

/** Holds wander mode still while `paused` is true for this reason. Her spot afterwards is where she is then. */
export function setWanderPaused(reason: string, paused: boolean) {
  if (paused)
    pauses.add(reason)
  else
    pauses.delete(reason)
}

/** Whether something other than `reason` holds her still now, so that something moves her, not the owner. */
export function isWanderPausedBesides(reason: string) {
  return [...pauses].some(other => other !== reason)
}

/** About 30 updates a second, smooth enough for a small window. */
const FRAME_MS = 33
/** She rests this long between flights, in a random time between the two. */
const REST_MS = [6_000, 18_000] as const
/** The mouse this close to her window counts as on her. */
const HOVER_MARGIN = 24
/** A move bigger than this that she did not make is the owner's drag. */
const OWNER_MOVE = 12

async function loadEnabled() {
  if (!existsSync(SETTINGS_FILE))
    return false
  return parse(settingsSchema, JSON.parse(await readFile(SETTINGS_FILE, 'utf8'))).enabled
}

async function saveEnabled(enabled: boolean) {
  await mkdir(FAIRY_DATA_DIR, { recursive: true })
  await writeFile(SETTINGS_FILE, `${JSON.stringify({ enabled }, null, 2)}\n`)
}

export function createWanderService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const { window } = params
  let enabled = false
  let timer: ReturnType<typeof setInterval> | undefined
  /** Her resting spot, without the bob. */
  let home: Point | undefined
  /** Where she put the window last, to tell her moves from the owner's. */
  let placed: Point | undefined
  let flight: { from: Point, to: Point, startedAt: number, durationMs: number } | undefined
  let restUntil = 0

  const restTime = () => REST_MS[0] + Math.random() * (REST_MS[1] - REST_MS[0])

  function place(point: Point) {
    placed = point
    // NOTICE:
    // Above 100% scaling on Windows, setPosition changes the window size a little on each call, so a window that
    // moves every frame grows. setBounds with the same size keeps it. The main window glide has the same fix.
    // Source: https://github.com/electron/electron/issues/9477
    // Removal: Electron keeps the size of a window that setPosition moves.
    const { width, height } = window.getBounds()
    window.setBounds({ x: point.x, y: point.y, width, height }, false)
  }

  function mouseOnHer() {
    const cursor = screen.getCursorScreenPoint()
    const bounds = window.getBounds()
    return cursor.x >= bounds.x - HOVER_MARGIN && cursor.x <= bounds.x + bounds.width + HOVER_MARGIN
      && cursor.y >= bounds.y - HOVER_MARGIN && cursor.y <= bounds.y + bounds.height + HOVER_MARGIN
  }

  function tick() {
    if (window.isDestroyed() || !window.isVisible())
      return
    if (pauses.size) {
      // Something else moves her now. Afterwards, the place she ends up is her new spot.
      home = undefined
      flight = undefined
      return
    }
    const bounds = window.getBounds()
    const now = Date.now()
    // The owner dragged her, so the new place is her spot.
    if (!home || (placed && Math.hypot(bounds.x - placed.x, bounds.y - placed.y) > OWNER_MOVE)) {
      home = { x: bounds.x, y: bounds.y }
      placed = home
      flight = undefined
      restUntil = now + restTime()
    }
    if (mouseOnHer()) {
      // A flight stops where she is, and she rests there a while longer.
      if (flight)
        home = { x: bounds.x, y: bounds.y }
      flight = undefined
      restUntil = Math.max(restUntil, now + REST_MS[0])
      return
    }
    if (!flight && now >= restUntil) {
      const area = screen.getDisplayMatching(bounds).workArea
      flight = { from: home, to: nextSpot(home, bounds, area), startedAt: now, durationMs: 0 }
      flight.durationMs = flightDuration(flight.from, flight.to)
    }
    if (flight) {
      const elapsed = now - flight.startedAt
      place(flightPoint(flight.from, flight.to, elapsed, flight.durationMs, now))
      if (elapsed >= flight.durationMs) {
        home = flight.to
        flight = undefined
        restUntil = now + restTime()
      }
      return
    }
    // Resting, she bobs softly in place.
    place(flightPoint(home, home, 0, 1, now))
  }

  function apply(next: boolean) {
    enabled = next
    if (timer)
      clearInterval(timer)
    timer = undefined
    if (!enabled) {
      // She stays where she is, without the bob offset.
      if (home && !window.isDestroyed())
        place(home)
      home = undefined
      placed = undefined
      flight = undefined
      return
    }
    restUntil = Date.now() + 3_000
    timer = setInterval(tick, FRAME_MS)
  }

  defineInvokeHandler(params.context, electronWanderMode, async (request) => {
    if (request?.enabled !== undefined && request.enabled !== enabled) {
      apply(request.enabled)
      await saveEnabled(request.enabled).catch(error => log.warn(`could not save wander mode: ${errorMessageFrom(error)}`))
      log.log(`wander mode ${request.enabled ? 'on' : 'off'}`)
    }
    return { enabled }
  })

  void loadEnabled().then(apply).catch(error => log.warn(`could not read wander mode: ${errorMessageFrom(error)}`))

  return () => apply(false)
}
