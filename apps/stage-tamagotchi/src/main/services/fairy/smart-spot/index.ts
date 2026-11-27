import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow, Display } from 'electron'
import type { InferOutput } from 'valibot'

import type { Frame } from './layout'

import process from 'node:process'

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, parse as parsePath } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { desktopCapturer, screen } from 'electron'
import { boolean, number, object, optional, parse, record, string } from 'valibot'

import { electronSmartSpot } from '../../../../shared/eventa'
import { bubbleSay } from '../activity-bubble'
import { windowsKeptOutOfCaptures } from '../look-at-screen'
import { FAIRY_DATA_DIR } from '../memory-files'
import { registerMode } from '../modes'
import { PowerShellHost } from '../pc-actions/powershell-host'
import { isWanderPausedBesides, setWanderPaused } from '../wander'
import { bestSpot, menuGrid, spotCost } from './layout'

/**
 * FAIRY: smart spot. While a game or another app fills the screen, she moves off its menus, action bars, and
 * minimap to a free spot near an edge. She finds them in a few small screenshots on this PC, without the AI.
 *
 * - A drag by the owner during the app wins: she keeps that spot for that app, also next time.
 * - When the owner leaves the app, she goes back to where she was before.
 */

const SETTINGS_FILE = join(FAIRY_DATA_DIR, 'smart-spot.json')
const spotSchema = object({ x: number(), y: number(), width: number(), height: number() })
const settingsSchema = object({ enabled: optional(boolean(), true), spots: optional(record(string(), spotSchema), {}) })
type Settings = InferOutput<typeof settingsSchema>
const log = useLogg('fairy-smart-spot').useGlobalConfig()

const POLL_MS = 3_000
/** She checks her spot again this often, for menus that open later, such as bags or the shop. */
const RECHECK_MS = 30_000
/** She moves on a check only when she covers this much menu, and the new spot is clearly better. */
const MOVE_MENU = 0.25
const BETTER_BY = 1
/** Screenshots for one look, this far apart. */
const FRAMES = 3
const FRAME_GAP_MS = 450
const FRAME_WIDTH = 480
/** A move bigger than this that she did not make is the owner's drag. */
const OWNER_MOVE = 12
/** The app must be away this many checks in a row before she goes back, so a quick Alt+Tab does not move her. */
const AWAY_POLLS = 2
/** Windows' own full-screen surfaces: the desktop, the Start menu, search, and the task switcher. */
const NOT_APPS = new Set(['explorer', 'startmenuexperiencehost', 'searchhost', 'shellexperiencehost', 'lockapp'])
const GLIDE_MS = 450
const FRAME_MS = 16

const FRONT_SCRIPT = `
Add-Type -Namespace Fairy -Name Spot -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr hWnd, out int processId);
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr hWnd, out RECT rect);
'@ -ErrorAction SilentlyContinue
$h = [Fairy.Spot]::GetForegroundWindow()
$id = 0
[void][Fairy.Spot]::GetWindowThreadProcessId($h, [ref]$id)
$r = New-Object Fairy.Spot+RECT
[void][Fairy.Spot]::GetWindowRect($h, [ref]$r)
$name = (Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName
@{ name = $name; x = $r.Left; y = $r.Top; width = $r.Right - $r.Left; height = $r.Bottom - $r.Top } | ConvertTo-Json -Compress
`

interface Front { name: string, x: number, y: number, width: number, height: number }

/** The display that a window fills, or nothing when it does not fill one. */
function filledDisplay(front: Front): Display | undefined {
  if (!front.name || front.width <= 0)
    return undefined
  const box = screen.screenToDipRect(null, { x: front.x, y: front.y, width: front.width, height: front.height })
  const display = screen.getDisplayMatching(box)
  const { bounds } = display
  const near = (a: number, b: number) => Math.abs(a - b) <= 2
  return near(box.x, bounds.x) && near(box.y, bounds.y) && box.width >= bounds.width - 2 && box.height >= bounds.height - 2 ? display : undefined
}

export function createSmartSpotService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const { window } = params
  const shell = new PowerShellHost()
  const ownName = parsePath(process.execPath).name.toLowerCase()
  let settings: Settings = { enabled: true, spots: {} }
  let session: { app: string, display: Display, before: { x: number, y: number }, placed?: { x: number, y: number }, ownerSpot: boolean, checkedAt: number, away: number } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  async function save() {
    await mkdir(FAIRY_DATA_DIR, { recursive: true })
    await writeFile(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`)
  }

  async function front(): Promise<Front | undefined> {
    try {
      return JSON.parse(await shell.run(FRONT_SCRIPT)) as Front
    }
    catch {
      return undefined
    }
  }

  /** Glides her window to a point and keeps its size. See the NOTICE in wander about setPosition. */
  async function glide(to: { x: number, y: number }) {
    const from = window.getBounds()
    const started = Date.now()
    while (!window.isDestroyed()) {
      const t = Math.min(1, (Date.now() - started) / GLIDE_MS)
      const ease = 1 - (1 - t) ** 3
      const point = { x: Math.round(from.x + (to.x - from.x) * ease), y: Math.round(from.y + (to.y - from.y) * ease) }
      window.setBounds({ ...point, width: from.width, height: from.height }, false)
      if (session)
        session.placed = point
      if (t >= 1)
        return
      await sleep(FRAME_MS)
    }
  }

  /** A few small screenshots of a display, without her own window in them. */
  async function look(display: Display): Promise<Frame[]> {
    const height = Math.round(FRAME_WIDTH * display.size.height / display.size.width)
    const protect = !windowsKeptOutOfCaptures()
    if (protect)
      window.setContentProtection(true)
    try {
      const frames: Frame[] = []
      for (let index = 0; index < FRAMES; index++) {
        if (index)
          await sleep(FRAME_GAP_MS)
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: FRAME_WIDTH, height } })
        const image = (sources.find(source => source.display_id === String(display.id)) ?? sources[0])?.thumbnail
        if (!image || image.isEmpty())
          throw new Error('the screen capture was empty')
        const size = image.getSize()
        frames.push({ width: size.width, height: size.height, data: new Uint8Array(image.toBitmap()) })
      }
      return frames
    }
    finally {
      if (protect && !window.isDestroyed())
        window.setContentProtection(false)
    }
  }

  /** Looks at the screen and moves her off the menus. Without `force`, she moves only when she covers a menu. */
  async function findSpot(force: boolean) {
    if (!session)
      return
    const { display } = session
    session.checkedAt = Date.now()
    const grid = menuGrid(await look(display))
    if (!session || window.isDestroyed())
      return
    const bounds = window.getBounds()
    const from = { x: bounds.x - display.bounds.x, y: bounds.y - display.bounds.y }
    const size = { width: bounds.width, height: bounds.height }
    const now = spotCost(grid, display.bounds, { ...from, ...size }, from)
    const best = bestSpot(grid, display.bounds, size, from)
    if (!force && (now.menu < MOVE_MENU || best.cost > now.cost - BETTER_BY))
      return
    log.log(`moving off the menus of ${session.app} (menu under her ${Math.round(now.menu * 100)}% → ${Math.round(best.menu * 100)}%)`)
    await glide({ x: display.bounds.x + best.x, y: display.bounds.y + best.y })
  }

  async function start(app: string, display: Display) {
    const bounds = window.getBounds()
    session = { app, display, before: { x: bounds.x, y: bounds.y }, ownerSpot: false, checkedAt: 0, away: 0 }
    setWanderPaused('smart-spot', true)
    const saved = settings.spots[app]
    if (saved) {
      // A spot from another screen size keeps its place in proportion.
      const x = Math.round(saved.x / saved.width * display.bounds.width)
      const y = Math.round(saved.y / saved.height * display.bounds.height)
      session.ownerSpot = true
      log.log(`${app} fills the screen: going to the owner's spot`)
      await glide({ x: display.bounds.x + Math.min(x, display.bounds.width - bounds.width), y: display.bounds.y + Math.min(y, display.bounds.height - bounds.height) })
      return
    }
    log.log(`${app} fills the screen: looking for a free spot`)
    await findSpot(true)
  }

  async function end() {
    const ended = session
    session = undefined
    setWanderPaused('smart-spot', false)
    if (ended && !window.isDestroyed()) {
      log.log(`${ended.app} is gone: going back`)
      await glide(ended.before)
    }
  }

  /** Notices the owner's drag during the app, and keeps that spot for the app. */
  async function watchForDrag() {
    if (!session)
      return
    const bounds = window.getBounds()
    if (isWanderPausedBesides('smart-spot') || !session.placed) {
      // A throw, a nap, or a prank moves her now. Where she ends up is not the owner's choice.
      session.placed = { x: bounds.x, y: bounds.y }
      return
    }
    if (Math.hypot(bounds.x - session.placed.x, bounds.y - session.placed.y) <= OWNER_MOVE)
      return
    const { display, app } = session
    session.placed = { x: bounds.x, y: bounds.y }
    session.ownerSpot = true
    settings.spots[app] = { x: bounds.x - display.bounds.x, y: bounds.y - display.bounds.y, width: display.bounds.width, height: display.bounds.height }
    await save()
    log.log(`the owner picked her spot for ${app}`)
    bubbleSay('Okay, I\'ll sit here for this one.', 2500)
  }

  async function tick() {
    if (!settings.enabled) {
      if (session)
        await end()
      return
    }
    const app = await front()
    if (!app || window.isDestroyed() || !window.isVisible())
      return
    // A click on her own window keeps everything as it is.
    if (app.name.toLowerCase() === ownName)
      return
    // The Windows desktop and the Start menu also fill the screen, but they are not apps to sit out of the way of.
    const display = NOT_APPS.has(app.name.toLowerCase()) ? undefined : filledDisplay(app)
    const herDisplay = screen.getDisplayMatching(window.getBounds())
    if (display && display.id === herDisplay.id) {
      if (session?.app !== app.name) {
        if (session)
          await end()
        await start(app.name, display)
        return
      }
      session.away = 0
      await watchForDrag()
      if (!session.ownerSpot && Date.now() - session.checkedAt > RECHECK_MS)
        await findSpot(false)
      return
    }
    if (session && ++session.away >= AWAY_POLLS)
      await end()
  }

  function loop() {
    if (stopped)
      return
    void tick()
      .catch(error => log.warn(`smart spot check failed: ${errorMessageFrom(error)}`))
      .finally(() => {
        if (!stopped)
          timer = setTimeout(loop, POLL_MS)
      })
  }

  const unregister = registerMode('smartSpot', {
    get: () => settings.enabled,
    set: async (on) => {
      if (on === settings.enabled)
        return
      settings.enabled = on
      await save().catch(error => log.warn(`could not save smart spot: ${errorMessageFrom(error)}`))
    },
  })

  defineInvokeHandler(params.context, electronSmartSpot, async (request) => {
    let changed = false
    if (request?.enabled !== undefined && request.enabled !== settings.enabled) {
      settings.enabled = request.enabled
      changed = true
    }
    if (request?.forget) {
      settings.spots = {}
      if (session)
        session.ownerSpot = false
      changed = true
    }
    if (changed)
      await save().catch(error => log.warn(`could not save smart spot: ${errorMessageFrom(error)}`))
    return { enabled: settings.enabled, apps: Object.keys(settings.spots) }
  })

  void (async () => {
    if (existsSync(SETTINGS_FILE))
      settings = parse(settingsSchema, JSON.parse(await readFile(SETTINGS_FILE, 'utf8')))
  })()
    .catch(error => log.warn(`could not read smart spot: ${errorMessageFrom(error)}`))
    .finally(loop)

  return () => {
    unregister()
    stopped = true
    clearTimeout(timer)
    shell.stop()
    setWanderPaused('smart-spot', false)
  }
}
