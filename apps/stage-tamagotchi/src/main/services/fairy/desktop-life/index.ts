import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type { AvatarState } from '../../../../shared/eventa'
import type { Flight, Sample } from './fling'
import type { ReactionKind } from './reactions'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { app, powerMonitor, screen } from 'electron'

import { electronAvatarState } from '../../../../shared/eventa'
import { bubbleSay } from '../activity-bubble'
import { PowerShellHost } from '../pc-actions/powershell-host'
import { setWanderPaused } from '../wander'
import { flightDuration, flightPoint } from '../wander/path'
import { mediaLevel, METER_SCRIPT, parsePeaks } from './audio-meter'
import { flingStep, MIN_THROW_SPEED, releaseSpeed, speedOf, STOP_SPEED } from './fling'
import { loadReactions, pickLine } from './reactions'

/**
 * FAIRY: little bits of life on the desktop.
 *
 * - Thrown: a fast release of a drag sends her flying. She slows down and bounces off the screen edges.
 * - Napping: when the owner leaves the mouse and keys alone for a while, she floats down and sleeps, and wakes up
 *   when they come back.
 * - Dancing: while a music or video app plays sound, she sways and hops in place. Calls, games, and her own voice do
 *   not count.
 *
 * Each one sends an avatar state, so her model can act it out, and says a line from `fairy-data/reactions.json`.
 */

const log = useLogg('fairy-desktop-life').useGlobalConfig()

const FRAME_MS = 16
/** She falls asleep after this long without mouse or keys. */
const NAP_AFTER_SECONDS = 5 * 60
/** Any input within this many seconds wakes her. */
const AWAKE_IDLE_SECONDS = 3
const IDLE_CHECK_MS = 5_000
/** The sleep line stays in the bubble. The bubble hides a stale line, so it comes again this often. */
const SLEEP_LINE_EVERY_MS = 20_000
/** At most one bounce line in this time, so a corner does not spam the bubble. */
const BOUNCE_LINE_GAP_MS = 1_500
const METER_EVERY_MS = 400
/** A media app louder than this plays something. */
const MUSIC_LEVEL = 0.02
/** She starts after this much music in a row, and stops after this much quiet. */
const DANCE_START_MS = 3_000
const DANCE_STOP_MS = 4_000
/** One sway left and right takes this long, and a hop half of it. */
const SWAY_MS = 1_250
const SWAY_WIDTH = 10
const HOP_HEIGHT = 8

export function createDesktopLifeService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const { window } = params
  const samples: Sample[] = []
  let flight: Flight | undefined
  let flightTimer: ReturnType<typeof setInterval> | undefined
  let lastBounceLine = 0
  let sleeping = false
  let sleepLineTimer: ReturnType<typeof setInterval> | undefined
  let glideTimer: ReturnType<typeof setInterval> | undefined
  /** The meter has its own PowerShell, so a long PC action never makes her miss the beat. */
  const meter = new PowerShellHost()
  let musicSince = 0
  let quietSince = 0
  let dance: { center: { x: number, y: number }, timer: ReturnType<typeof setInterval>, startedAt: number } | undefined

  function sendState(state: AvatarState) {
    params.context.emit(electronAvatarState, { state })
  }

  function say(kind: ReactionKind, holdMs = 2500) {
    void loadReactions()
      .then(reactions => pickLine(reactions, kind))
      .then(line => line && bubbleSay(line, holdMs))
      .catch(error => log.warn(`could not read reactions: ${errorMessageFrom(error)}`))
  }

  /** Moves the window and keeps its size. See the NOTICE in wander about setPosition. */
  function moveTo(x: number, y: number) {
    const { width, height } = window.getBounds()
    window.setBounds({ x: Math.round(x), y: Math.round(y), width, height }, false)
  }

  function endFlight() {
    clearInterval(flightTimer)
    flightTimer = undefined
    flight = undefined
    sendState('landed')
    say('landed')
    // Wander mode waits a moment, so she lands before she flies off again.
    setTimeout(setWanderPaused, 1500, 'thrown', false)
  }

  function startFlight(speed: { vx: number, vy: number }) {
    const bounds = window.getBounds()
    flight = { x: bounds.x, y: bounds.y, vx: speed.vx, vy: speed.vy }
    setWanderPaused('thrown', true)
    sendState('thrown')
    say('thrown', 1800)
    let last = Date.now()
    flightTimer = setInterval(() => {
      if (!flight || window.isDestroyed())
        return endFlight()
      const now = Date.now()
      const size = window.getBounds()
      const step = flingStep(flight, now - last, size, screen.getDisplayMatching(size).workArea)
      last = now
      flight = step.flight
      moveTo(flight.x, flight.y)
      if (step.bounced && now - lastBounceLine > BOUNCE_LINE_GAP_MS) {
        lastBounceLine = now
        say('bounce', 1200)
      }
      if (speedOf(flight) < STOP_SPEED)
        endFlight()
    }, FRAME_MS)
  }

  // A drag fires "move" for each step and "moved" once at the release.
  const onMove = () => {
    if (flight || glideTimer || dance)
      return
    const { x, y } = window.getBounds()
    samples.push({ x, y, at: Date.now() })
    while (samples.length > 20)
      samples.shift()
  }
  const onMoved = () => {
    if (dance) {
      // The owner dragged her while she danced. She dances on at the new place.
      const { x, y } = window.getBounds()
      dance.center = { x, y }
      return
    }
    if (flight || glideTimer)
      return
    const speed = releaseSpeed(samples, Date.now())
    samples.length = 0
    if (speedOf(speed) >= MIN_THROW_SPEED && !sleeping)
      startFlight(speed)
  }
  window.on('move', onMove)
  window.on('moved', onMoved)

  /** Floats down to the bottom of the screen to sleep there. */
  function glideDown() {
    const bounds = window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    const from = { x: bounds.x, y: bounds.y }
    const to = { x: bounds.x, y: area.y + area.height - bounds.height }
    const duration = flightDuration(from, to)
    const startedAt = Date.now()
    glideTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const point = flightPoint(from, to, elapsed, duration, 0)
      moveTo(point.x, point.y)
      if (elapsed >= duration) {
        clearInterval(glideTimer)
        glideTimer = undefined
      }
    }, FRAME_MS)
  }

  function fallAsleep() {
    sleeping = true
    setWanderPaused('sleeping', true)
    sendState('sleeping')
    glideDown()
    say('sleep', SLEEP_LINE_EVERY_MS + 5000)
    sleepLineTimer = setInterval(say, SLEEP_LINE_EVERY_MS, 'sleep', SLEEP_LINE_EVERY_MS + 5000)
    log.log('the owner is away, so she takes a nap')
  }

  function wakeUp() {
    sleeping = false
    clearInterval(sleepLineTimer)
    sendState('awake')
    say('wake', 3500)
    setTimeout(setWanderPaused, 2500, 'sleeping', false)
    log.log('the owner is back, so she wakes up')
  }

  function startDance() {
    const { x, y } = window.getBounds()
    setWanderPaused('dancing', true)
    sendState('dancing')
    say('dance', 2500)
    dance = {
      center: { x, y },
      startedAt: Date.now(),
      timer: setInterval(() => {
        if (!dance || window.isDestroyed())
          return
        const beat = (Date.now() - dance.startedAt) / SWAY_MS * Math.PI * 2
        moveTo(dance.center.x + Math.sin(beat) * SWAY_WIDTH, dance.center.y - Math.abs(Math.sin(beat)) * HOP_HEIGHT)
      }, FRAME_MS),
    }
  }

  function stopDance() {
    if (!dance)
      return
    clearInterval(dance.timer)
    moveTo(dance.center.x, dance.center.y)
    dance = undefined
    sendState('still')
    setWanderPaused('dancing', false)
  }

  let metering = false
  const meterTimer = setInterval(() => {
    if (metering || window.isDestroyed())
      return
    metering = true
    const ownProcesses = new Set(app.getAppMetrics().map(metric => metric.pid))
    void meter.run(METER_SCRIPT)
      .then((output) => {
        const now = Date.now()
        const playing = mediaLevel(parsePeaks(output), ownProcesses) > MUSIC_LEVEL
        if (playing) {
          musicSince ||= now
          quietSince = 0
        }
        else {
          quietSince ||= now
          musicSince = 0
        }
        if (!dance && playing && now - musicSince >= DANCE_START_MS && !sleeping && !flight)
          startDance()
        else if (dance && (sleeping || flight || (!playing && now - quietSince >= DANCE_STOP_MS)))
          stopDance()
      })
      .catch(error => log.warn(`could not read the sound levels: ${errorMessageFrom(error)}`))
      .finally(() => {
        metering = false
      })
  }, METER_EVERY_MS)

  const idleTimer = setInterval(() => {
    if (window.isDestroyed() || flight)
      return
    const idle = powerMonitor.getSystemIdleTime()
    if (!sleeping && idle >= NAP_AFTER_SECONDS)
      fallAsleep()
    else if (sleeping && idle <= AWAKE_IDLE_SECONDS)
      wakeUp()
  }, IDLE_CHECK_MS)

  return () => {
    clearInterval(meterTimer)
    stopDance()
    meter.stop()
    clearInterval(idleTimer)
    clearInterval(flightTimer)
    clearInterval(glideTimer)
    clearInterval(sleepLineTimer)
    setWanderPaused('thrown', false)
    setWanderPaused('sleeping', false)
    setWanderPaused('dancing', false)
    if (!window.isDestroyed()) {
      window.off('move', onMove)
      window.off('moved', onMoved)
    }
  }
}
