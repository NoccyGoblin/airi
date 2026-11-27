import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { Prank } from './plan'

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { BrowserWindow, powerMonitor, screen } from 'electron'
import { boolean, object, optional, parse, string } from 'valibot'

import { electronAvatarState, electronMischief } from '../../../../shared/eventa'
import { bubbleSay } from '../activity-bubble'
import { bubblePlace } from '../activity-bubble/place'
import { loadReactions, pickLine } from '../desktop-life/reactions'
import { FAIRY_DATA_DIR } from '../memory-files'
import { PowerShellHost } from '../pc-actions/powershell-host'
import { drawDoodle } from '../screen-draw'
import { addStickyNote } from '../sticky-notes'
import { isCharacterBusy } from '../stop-key'
import { setWanderPaused } from '../wander'
import { nextPrankAt, pickPrank, PRANK_DOODLES } from './plan'

/**
 * FAIRY: mischief mode. When the owner turns it on, the character plays a small, harmless prank now and then: she
 * hides at the screen edge, tugs the mouse pointer a little, shows a joke "takeover" popup, doodles on the screen, or
 * leaves a sticky note. She never clicks, types, or closes anything.
 *
 * A prank waits while the owner is away, while she is busy, and while a fullscreen app such as a game is in front.
 */

const SETTINGS_FILE = join(FAIRY_DATA_DIR, 'mischief.json')
const settingsSchema = object({ enabled: optional(boolean(), false), character: optional(string(), '') })
const log = useLogg('fairy-mischief').useGlobalConfig()

const CHECK_MS = 30_000
/** The owner counts as here while the last input was this recent. */
const ACTIVE_IDLE_SECONDS = 60
const HIDE_MS = 8_000
const POPUP_MS = 6_000
const POPUP_SIZE = { width: 380, height: 120 }
/** A tug moves the pointer at most this far, in DIP. */
const MAX_TUG = 150

/** Prints "fullscreen" when the window in front covers its whole screen, for example a game or a video. */
const FULLSCREEN_SCRIPT = `
Add-Type -Namespace Fairy -Name Full -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern System.IntPtr MonitorFromWindow(System.IntPtr h, int flags);
[DllImport("user32.dll")] public static extern bool GetMonitorInfo(System.IntPtr m, ref MONITORINFO i);
public struct RECT { public int L, T, R, B; }
[StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int Size; public RECT Monitor; public RECT Work; public int Flags; }
'@
[void][Fairy.Full]::SetProcessDPIAware()
$h = [Fairy.Full]::GetForegroundWindow()
$r = New-Object Fairy.Full+RECT
[void][Fairy.Full]::GetWindowRect($h, [ref]$r)
$m = New-Object Fairy.Full+MONITORINFO
$m.Size = [System.Runtime.InteropServices.Marshal]::SizeOf($m)
[void][Fairy.Full]::GetMonitorInfo([Fairy.Full]::MonitorFromWindow($h, 2), [ref]$m)
if ($r.L -le $m.Monitor.L -and $r.T -le $m.Monitor.T -and $r.R -ge $m.Monitor.R -and $r.B -ge $m.Monitor.B) { 'fullscreen' } else { 'window' }
`

function tugScript(path: { x: number, y: number }[]) {
  return `
Add-Type -Namespace Fairy -Name Tug -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
'@
[void][Fairy.Tug]::SetProcessDPIAware()
${path.map(point => `[void][Fairy.Tug]::SetCursorPos(${Math.round(point.x)}, ${Math.round(point.y)}); Start-Sleep -Milliseconds 30`).join('\n')}
`
}

function popupPage(text: string) {
  const safe = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `<!doctype html><html><head><meta charset="utf-8"><title>prank</title><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:700 15px/1.35 system-ui,'Segoe UI',sans-serif}
#box{position:absolute;inset:6px;border-radius:18px;background:linear-gradient(135deg,#ff4fa3,#9b5cff);color:#fff;padding:16px 18px;
box-shadow:0 4px 18px rgba(0,0,0,.4);cursor:pointer;animation:shake .5s 2}
@keyframes shake{0%,100%{transform:none}25%{transform:translateX(-6px) rotate(-1deg)}75%{transform:translateX(6px) rotate(1deg)}}
</style></head><body><div id="box" onclick="window.close()">${safe}</div></body></html>`
}

export function createMischiefService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const character = params.window
  const shell = new PowerShellHost()
  let enabled = false
  let name = ''
  let last: Prank | undefined
  let nextAt = 0
  let pranking = false

  async function say(kind: Parameters<typeof pickLine>[1], holdMs = 3000) {
    const line = pickLine(await loadReactions(), kind)
    if (line)
      bubbleSay(line, holdMs)
    return line
  }

  async function inFullscreen() {
    return (await shell.run(FULLSCREEN_SCRIPT).catch(() => 'window')).trim() === 'fullscreen'
  }

  /** Whether the pointer stayed still for a moment, so a tug does not fight the owner's hand. */
  async function pointerResting() {
    const before = screen.getCursorScreenPoint()
    await sleep(1500)
    const after = screen.getCursorScreenPoint()
    return before.x === after.x && before.y === after.y
  }

  const pranks: Record<Prank, () => Promise<void>> = {
    hide: async () => {
      const bounds = character.getBounds()
      const area = screen.getDisplayMatching(bounds).workArea
      const leftSide = bounds.x + bounds.width / 2 < area.x + area.width / 2
      const hidden = { ...bounds, x: Math.round(leftSide ? area.x - bounds.width * 0.7 : area.x + area.width - bounds.width * 0.3) }
      setWanderPaused('mischief', true)
      character.setBounds(hidden, false)
      await say('prankHide', HIDE_MS)
      await sleep(HIDE_MS)
      if (!character.isDestroyed())
        character.setBounds(bounds, false)
      setWanderPaused('mischief', false)
    },
    tug: async () => {
      const from = screen.getCursorScreenPoint()
      const bounds = character.getBounds()
      const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      const distance = Math.hypot(center.x - from.x, center.y - from.y)
      const step = Math.min(MAX_TUG, distance * 0.35) / Math.max(1, distance)
      const to = { x: from.x + (center.x - from.x) * step, y: from.y + (center.y - from.y) * step }
      const path = Array.from({ length: 12 }, (_, index) => {
        const progress = (index + 1) / 12
        return screen.dipToScreenPoint({ x: Math.round(from.x + (to.x - from.x) * progress), y: Math.round(from.y + (to.y - from.y) * progress) })
      })
      await shell.run(tugScript(path))
      await say('prankTug')
    },
    popup: async () => {
      const text = pickLine(await loadReactions(), 'prankPopup')
      if (!text)
        return
      const bounds = character.getBounds()
      const spot = bubblePlace(bounds, POPUP_SIZE, screen.getDisplayMatching(bounds).workArea)
      const popup = new BrowserWindow({
        ...POPUP_SIZE,
        ...spot,
        frame: false,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        hasShadow: false,
        alwaysOnTop: true,
        focusable: false,
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
      })
      popup.webContents.on('will-navigate', event => event.preventDefault())
      popup.once('ready-to-show', () => popup.showInactive())
      await popup.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(popupPage(text))}`)
      setTimeout(() => popup.isDestroyed() || popup.destroy(), POPUP_MS)
    },
    doodle: async () => {
      const cursor = screen.getCursorScreenPoint()
      const doodle = PRANK_DOODLES[Math.floor(Math.random() * PRANK_DOODLES.length)]
      await drawDoodle(doodle, { x: cursor.x - 110, y: cursor.y - 110, width: 220, height: 220 })
      await say('prankDoodle')
    },
    note: async () => {
      const text = pickLine(await loadReactions(), 'prankNote')
      if (text)
        await addStickyNote(text, name)
    },
  }

  /** Plays one prank. A cursor tug only happens while the pointer rests and no fullscreen app is in front. */
  async function prank(force = false): Promise<Prank | undefined> {
    if (pranking || character.isDestroyed())
      return undefined
    pranking = true
    try {
      const fullscreen = await inFullscreen()
      if (fullscreen && !force)
        return undefined
      let chosen = pickPrank(last, { tugAllowed: !fullscreen })
      if (chosen === 'tug' && !await pointerResting())
        chosen = pickPrank('tug', { tugAllowed: false })
      last = chosen
      params.context.emit(electronAvatarState, { state: 'mischief' })
      await pranks[chosen]()
      log.log(`played the ${chosen} prank`)
      return chosen
    }
    catch (error) {
      log.warn(`a prank failed: ${errorMessageFrom(error)}`)
      return undefined
    }
    finally {
      pranking = false
    }
  }

  const timer = setInterval(() => {
    if (!enabled || Date.now() < nextAt)
      return
    // The owner must be here, and she must not be in the middle of something.
    if (powerMonitor.getSystemIdleTime() > ACTIVE_IDLE_SECONDS || isCharacterBusy())
      return
    nextAt = nextPrankAt(Date.now())
    void prank()
  }, CHECK_MS)

  async function save() {
    await mkdir(FAIRY_DATA_DIR, { recursive: true })
    await writeFile(SETTINGS_FILE, `${JSON.stringify({ enabled, character: name }, null, 2)}\n`)
  }

  defineInvokeHandler(params.context, electronMischief, async (request) => {
    if (request.character)
      name = request.character
    if (request.enabled !== undefined && request.enabled !== enabled) {
      enabled = request.enabled
      nextAt = nextPrankAt(Date.now())
      await save().catch(error => log.warn(`could not save mischief mode: ${errorMessageFrom(error)}`))
      log.log(`mischief mode ${enabled ? 'on' : 'off'}`)
    }
    const played = request.prankNow ? await prank(true) : undefined
    return { enabled, played }
  })

  void (async () => {
    if (!existsSync(SETTINGS_FILE))
      return
    const saved = parse(settingsSchema, JSON.parse(await readFile(SETTINGS_FILE, 'utf8')))
    enabled = saved.enabled
    name = saved.character
    nextAt = nextPrankAt(Date.now())
  })().catch(error => log.warn(`could not read mischief mode: ${errorMessageFrom(error)}`))

  return () => {
    clearInterval(timer)
    shell.stop()
    setWanderPaused('mischief', false)
  }
}
