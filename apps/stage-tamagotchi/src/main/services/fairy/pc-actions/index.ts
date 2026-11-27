import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { PcActionRequest, PcActionResult, PcCapture } from '../../../../shared/eventa'
import type { OpenWindow, StartApp } from './apps'
import type { KeyCombination } from './keys'
import type { PhysicalRect } from './mouse'
import type { UiElement } from './ui-tree'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'
import { app, BrowserWindow, clipboard, net, screen, shell } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'

import { electronPcAction, electronPcCapture } from '../../../../shared/eventa'
import { isClickThroughWindow } from '../activity-bubble'
import { captureWithoutAiri } from '../look-at-screen'
import { matchOpenWindows, matchStartApps, normalizeWebAddress } from './apps'
import { chatKindOf } from './chats'
import { describeKeyCombination, parseKeyCombination } from './keys'
import { clickScript, screenPointOf, scrollScript, windowAtScript } from './mouse'
import { ocrScript } from './ocr'
import { PowerShellHost } from './powershell-host'
import { centerOf, describeUiTree, parseUiTree, uiTreeScript } from './ui-tree'
import { parseYouTubeResults, youTubeSearchUrl, youTubeWatchUrl } from './youtube'

/**
 * FAIRY: fast, generic actions on the PC that the owner asks the character for, such as opening a website or an app,
 * pressing a shortcut in the app in front, and media keys. They work in any app because they use the system, not
 * clicks on a screen.
 */

const execFileAsync = promisify(execFile)
const log = useLogg('fairy-pc-actions').useGlobalConfig()
/** One PowerShell for all actions, so each action skips the PowerShell start. */
const powerShell = new PowerShellHost()

const BROWSERS = { chrome: 'chrome', edge: 'msedge', firefox: 'firefox', brave: 'brave', opera: 'opera' } as const

// Virtual key codes of libuiohook for keys that UiohookKey does not name.
const MEDIA_KEYS = {
  'play-pause': 0xE022,
  'next': 0xE019,
  'previous': 0xE010,
  'volume-up': 0xE030,
  'volume-down': 0xE02E,
  'mute': 0xE020,
} as const

/** A longer text belongs in a document, not in a typed message. */
const MAX_TYPED_CHARACTERS = 2000

const START_APPS_TTL_MS = 10 * 60_000
let startApps: { at: number, apps: StartApp[] } | undefined

async function listStartApps(): Promise<StartApp[]> {
  if (startApps && Date.now() - startApps.at < START_APPS_TTL_MS)
    return startApps.apps
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-StartApps | ConvertTo-Json -Compress'], { timeout: 15_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
  const raw = JSON.parse(stdout) as { Name: string, AppID: string } | { Name: string, AppID: string }[]
  const apps = (Array.isArray(raw) ? raw : [raw])
    // Some entries are web links of an installer, not apps.
    .filter(app => app.AppID && !/^https?:/i.test(app.AppID))
    .map(app => ({ name: app.Name.trim(), appId: app.AppID }))
  startApps = { at: Date.now(), apps }
  return apps
}

/** Recent screenshots for pointing, by id, with the display they show. Older ones fall out. */
const captures = new Map<string, { image: { width: number, height: number }, display: PhysicalRect }>()
const MAX_CAPTURES = 5

/** Takes a screenshot of the display under the mouse pointer for pointing, without AIRI's windows. */
async function captureForPointing(): Promise<PcCapture> {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const shot = await captureWithoutAiri(display)
  const captureId = randomUUID()
  captures.set(captureId, { image: { width: shot.width, height: shot.height }, display: screen.dipToScreenRect(null, display.bounds) })
  while (captures.size > MAX_CAPTURES)
    captures.delete(captures.keys().next().value!)
  return { captureId, ...shot }
}

function contains(bounds: Electron.Rectangle, point: Electron.Point) {
  return point.x >= bounds.x && point.y >= bounds.y && point.x < bounds.x + bounds.width && point.y < bounds.y + bounds.height
}

/** True after Ctrl+K in Discord, until Enter or Escape. Then Enter opens a chat instead of sending. */
let discordSwitcherOpen = false

const FOREGROUND_SCRIPT = `
Add-Type -Namespace Fairy -Name Front -MemberDefinition @'
[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr hWnd, out int processId);
'@
$id = 0
[void][Fairy.Front]::GetWindowThreadProcessId([Fairy.Front]::GetForegroundWindow(), [ref]$id)
$process = Get-Process -Id $id
[Console]::OutputEncoding = [Text.Encoding]::UTF8
@{ processId = $id; processName = $process.ProcessName; title = $process.MainWindowTitle } | ConvertTo-Json -Compress
`

/** The process and title of the window in front, or nothing when it cannot be read. */
async function foregroundWindow(): Promise<{ processId: number, processName: string, title: string } | undefined> {
  try {
    const stdout = await powerShell.run(FOREGROUND_SCRIPT)
    return JSON.parse(stdout) as { processId: number, processName: string, title: string }
  }
  catch {
    return undefined
  }
}

/** Every process that has a window now. */
async function listOpenWindows(): Promise<OpenWindow[]> {
  const stdout = await powerShell.run('Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Id, ProcessName, MainWindowTitle, Product | ConvertTo-Json -Compress')
  if (!stdout.trim())
    return []
  const raw = JSON.parse(stdout) as RawWindow | RawWindow[]
  return (Array.isArray(raw) ? raw : [raw]).map(window => ({ id: window.Id, processName: window.ProcessName, title: window.MainWindowTitle ?? '', product: window.Product ?? '' }))
}

interface RawWindow {
  Id: number
  ProcessName: string
  MainWindowTitle?: string
  Product?: string
}

const WINDOW_WAIT_MS = 20_000
const WINDOW_POLL_MS = 700

// NOTICE:
// Windows only lets the foreground app move another window to the front. A tap of Alt before SetForegroundWindow
// lifts that lock for this call. Source: the SetForegroundWindow remarks in the Win32 docs.
// Remove when a supported API brings an app forward from a background process.
const FOCUS_SCRIPT = `
Add-Type -Namespace Fairy -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
'@
$handle = (Get-Process -Id __PID__).MainWindowHandle
[void][Fairy.Win]::ShowWindow($handle, 9)
[Fairy.Win]::keybd_event(0x12, 0, 0, 0)
[Fairy.Win]::keybd_event(0x12, 0, 2, 0)
[void][Fairy.Win]::SetForegroundWindow($handle)
`

async function openApp(name: string) {
  const matches = matchStartApps(await listStartApps(), name)
  if (!matches.length)
    throw new Error(`No installed app matches "${name}".`)
  const [startApp] = matches
  await execFileAsync('explorer.exe', [`shell:AppsFolder\\${startApp.appId}`], { windowsHide: true }).catch((error: { code?: number }) => {
    // explorer.exe exits with 1 even when it opens the app.
    if (error.code !== 1)
      throw error
  })
  const others = matches.slice(1, 4).map(other => other.name)
  const front = await bringToFront(startApp.name)
  return `Opened ${startApp.name}${front ? ' and brought it to the front, ready for keys and text' : ', but its window did not show up within 20 seconds'}.${others.length ? ` Other matches: ${others.join(', ')}.` : ''}`
}

/**
 * Waits until an app shows its window, then moves that window to the front, so keys and text reach it.
 * A splash screen such as "Discord Updater" does not count as the window.
 *
 * Returns:
 * - Whether a window came to the front
 */
async function bringToFront(name: string, waitMs = WINDOW_WAIT_MS): Promise<boolean> {
  const ownProcessIds = app.getAppMetrics().map(metric => metric.pid)
  const deadline = Date.now() + waitMs
  do {
    const window = matchOpenWindows(await listOpenWindows(), name, ownProcessIds).find(candidate => candidate.title && !/updat/i.test(candidate.title))
    if (window) {
      await powerShell.run(FOCUS_SCRIPT.replace('__PID__', String(window.id)))
      // The app needs a moment before it takes keys.
      await sleep(600)
      return true
    }
    await sleep(WINDOW_POLL_MS)
  } while (Date.now() < deadline)
  return false
}

/**
 * Keys go to the app in front. When an AIRI window is in front, the app behind it gets the focus first.
 *
 * Returns:
 * - The window in front, which is never an AIRI window
 */
async function frontAppForInput(): Promise<{ processId: number, processName: string, title: string }> {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused) {
    focused.blur()
    await sleep(250)
  }
  const front = await foregroundWindow()
  if (!front)
    throw new Error('Could not tell which app is in front, so nothing was typed or pressed.')
  if (app.getAppMetrics().some(metric => metric.pid === front.processId))
    throw new Error('AIRI itself is in front, so nothing was typed or pressed. Open or focus the target app first.')
  return front
}

/** A pause between clicks in one call, so the app keeps up. */
const CLICK_SETTLE_MS = 150
/** The most clicks in one call. */
const MAX_CLICKS = 20

/** The parts of the last app window that the character read, so a click by number finds its place. */
let lastRead: { processId: number, app: string, elements: UiElement[] } | undefined

async function uiTreeOf(processId: number) {
  return parseUiTree(await powerShell.run(uiTreeScript(processId)))
}

/** Reads the buttons, links, fields, and texts of a named app's window, or of the app in front. */
async function readWindow(name?: string) {
  let target: { processId: number, app: string }
  if (name?.trim()) {
    const ownProcessIds = app.getAppMetrics().map(metric => metric.pid)
    const window = matchOpenWindows(await listOpenWindows(), name, ownProcessIds).find(candidate => candidate.title)
    if (!window)
      throw new Error(`No open window matches "${name}". Open it with open_app first.`)
    // Built-in Windows apps all name "Windows Operating System" as their product. Their title names them better.
    const builtIn = /operating system/i.test(window.product)
    target = { processId: window.id, app: (builtIn ? window.title : window.product) || window.processName }
  }
  else {
    const front = await frontAppForInput()
    // Built-in Windows apps run inside ApplicationFrameHost. Their title names them better.
    target = { processId: front.processId, app: (front.processName === 'ApplicationFrameHost' && front.title) || front.processName }
  }
  return await readTarget(target)
}

/** Reads one window and keeps its parts for the next click. */
async function readTarget(target: { processId: number, app: string }) {
  let tree = await uiTreeOf(target.processId)
  if (!tree.elements.length) {
    // NOTICE:
    // Chromium and Electron apps, for example Discord, build their accessibility tree only after the first UI
    // Automation request, so the first read is empty. Source: tried by hand on Discord, where the second read lists all.
    // Remove when the first read of these apps lists their parts.
    await sleep(1000)
    tree = await uiTreeOf(target.processId)
  }
  lastRead = { ...target, elements: tree.elements }
  return describeUiTree(target.app, tree.title, tree.elements)
}

/** Refuses a click on a spot that one of AIRI's own windows covers. */
function assertNotOnAiri(point: { x: number, y: number }) {
  const dip = screen.screenToDipPoint(point)
  // A click-through window, such as the activity bubble, lets the click pass.
  const ownWindow = BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && window.isVisible() && !isClickThroughWindow(window) && contains(window.getBounds(), dip))
  if (ownWindow)
    throw new Error('AIRI\'s own window covers that spot, so nothing was clicked. Ask the owner to move the character or the chat.')
}

/** Apps need a moment after a key before the next key reaches the right place. */
const KEY_SETTLE_MS = 300

async function tap(combination: KeyCombination) {
  uIOhook.keyTap(UiohookKey[combination.key as keyof typeof UiohookKey], combination.modifiers.map(modifier => UiohookKey[modifier as keyof typeof UiohookKey]))
  await sleep(KEY_SETTLE_MS)
}

/** Pastes text, so any character works on any keyboard layout. The clipboard comes back afterwards. */
async function paste(text: string) {
  const saved = { text: clipboard.readText(), html: clipboard.readHTML(), image: clipboard.readImage() }
  clipboard.writeText(text)
  uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl])
  await sleep(400)
  clipboard.clear()
  if (!saved.image.isEmpty())
    clipboard.writeImage(saved.image)
  else if (saved.text || saved.html)
    clipboard.write({ text: saved.text, html: saved.html })
}

/** Strips everything but letters and digits, so "@Tom_99" and "tom 99" compare equal. */
function looseName(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Sends one Discord direct message, step by step, and checks the open chat before it sends.
 *
 * The quick switcher with "@" lists only people. A group chat that the person is in never matches, because the check
 * needs a direct message whose title holds the name.
 */
async function sendDiscordMessage(person: string, message: string) {
  const name = person.trim().replace(/^@+/, '')
  if (!name || !message.trim())
    throw new Error('A Discord message needs a person and a text.')
  // A Discord in the tray has no window, so it opens like a new start.
  if (!await bringToFront('Discord', 0)) {
    await openApp('Discord')
  }
  const front = await frontAppForInput()
  if (chatKindOf(front.processName, front.title) === 'other')
    throw new Error('Discord did not come to the front, so nothing was sent.')

  await tap(parseKeyCombination('ctrl+k'))
  await sleep(300)
  await paste(`@${name}`)
  // The quick switcher needs a moment to list its matches.
  await sleep(1000)
  await tap(parseKeyCombination('enter'))
  await sleep(900)

  const opened = await foregroundWindow()
  const title = opened?.title.replace(/ - Discord$/, '') ?? ''
  const kind = opened ? chatKindOf(opened.processName, opened.title) : 'other'
  if (kind !== 'direct' || !looseName(title).includes(looseName(name)))
    throw new Error(`Not sent: Discord opened "${title || 'an unknown view'}" instead of a direct message with ${name}. Ask the owner for the exact Discord name.`)

  await paste(message.slice(0, MAX_TYPED_CHARACTERS))
  await tap(parseKeyCombination('enter'))
  return `Sent the message to ${title} on Discord.`
}

/** YouTube sends its search results in the page only to a browser, so the request looks like one. */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
}

/** Searches YouTube and opens one of the first videos in the default browser. */
async function playYouTube(query: string, pick = 1) {
  if (!query.trim())
    throw new Error('Say what to play.')
  const response = await net.fetch(youTubeSearchUrl(query), { headers: BROWSER_HEADERS })
  if (!response.ok)
    throw new Error(`YouTube answered ${response.status}.`)
  const videos = parseYouTubeResults(await response.text())
  const index = Math.max(1, Math.min(videos.length, Math.trunc(pick))) - 1
  const video = videos[index]
  if (!video)
    throw new Error(`YouTube found no video for "${query}".`)
  await shell.openExternal(youTubeWatchUrl(video.id))
  const others = videos.filter(other => other !== video).slice(0, 3).map((other, position) => `${position + 1}. ${other.title}`)
  return `Opened "${video.title}"${video.channel ? ` by ${video.channel}` : ''} on YouTube in the default browser.${others.length ? ` Other results: ${others.join(' | ')}` : ''}`
}

/** Counts the owner's stops. An action that began before the last stop does nothing more. */
let stops = 0

/** Stops the running job: the clicks left in it and the actions that wait for their turn. */
export function stopPcActions() {
  stops++
}

function assertNotStopped(stopsAtStart: number) {
  if (stops !== stopsAtStart)
    throw new Error('The owner pressed Escape to stop you, so nothing more was done. Ask what they want now.')
}

async function run(request: PcActionRequest, stopsAtStart: number): Promise<string> {
  assertNotStopped(stopsAtStart)
  switch (request.kind) {
    case 'open-website': {
      const url = normalizeWebAddress(request.url)
      const browser = request.browser && request.browser !== 'default' ? BROWSERS[request.browser] : undefined
      if (!browser) {
        await shell.openExternal(url)
        return `Opened ${url} in the default browser.`
      }
      await powerShell.run(`Start-Process -FilePath '${browser}' -ArgumentList '${url.replaceAll('\'', '\'\'')}'`)
      return `Opened ${url} in ${request.browser}.`
    }
    case 'open-app':
      return await openApp(request.name)
    case 'discord-message':
      return await sendDiscordMessage(request.person, request.message)
    case 'close-app': {
      const ownProcessIds = app.getAppMetrics().map(metric => metric.pid)
      const windows = matchOpenWindows(await listOpenWindows(), request.name, ownProcessIds)
      if (!windows.length)
        throw new Error(`No open app matches "${request.name}". Windows, AIRI, and the Claude app cannot be closed.`)
      // CloseMainWindow asks the app to close, like its close button, so an app with unsaved work can still ask.
      await powerShell.run(`Get-Process -Id ${windows.map(window => window.id).join(',')} -ErrorAction SilentlyContinue | ForEach-Object { [void]$_.CloseMainWindow() }`)
      const [first] = windows
      return `Asked ${first.product || first.processName} to close (${windows.length} window${windows.length > 1 ? 's' : ''}). It can still ask to save.`
    }
    case 'press-keys': {
      const combination = parseKeyCombination(request.keys)
      const name = describeKeyCombination(combination)
      const front = await frontAppForInput()
      const kind = chatKindOf(front.processName, front.title)
      if (kind !== 'other') {
        if (name === 'Ctrl+K') {
          discordSwitcherOpen = true
        }
        else if (name === 'Escape') {
          discordSwitcherOpen = false
        }
        else if (name === 'Enter' && discordSwitcherOpen) {
          // Enter in the quick switcher opens a chat. It sends nothing.
          discordSwitcherOpen = false
        }
        else if (name === 'Enter' && kind === 'group' && !request.groupSendApproved) {
          throw new Error(`Not sent: the open Discord chat is a group or server channel ("${front!.title}"), not a direct message. Send there only when the owner said to send it to this group. To reach one person, open the quick switcher with ctrl+k and type "@" before the name.`)
        }
      }
      await tap(combination)
      return `Pressed ${name} in ${front.title || front.processName}${kind === 'direct' ? ' (a Discord direct message)' : ''}.`
    }
    case 'type-text': {
      const text = request.text.slice(0, MAX_TYPED_CHARACTERS)
      if (!text)
        throw new Error('No text given.')
      const front = await frontAppForInput()
      await paste(text)
      return `Typed ${text.length} characters into ${front.title || front.processName}. Nothing was sent.`
    }
    case 'click': {
      const capture = captures.get(request.captureId)
      if (!capture)
        throw new Error('That screenshot is too old. Take a new one and point again.')
      const point = screenPointOf({ x: request.x, y: request.y }, capture.image, capture.display)
      // AIRI's windows were hidden in the screenshot, but they are on screen. A click there would hit AIRI.
      assertNotOnAiri(point)
      await powerShell.run(clickScript(point, request.button, request.double))
      await sleep(KEY_SETTLE_MS)
      return `${request.double ? 'Double-clicked' : request.button === 'right' ? 'Right-clicked' : 'Clicked'} at (${request.x}, ${request.y}) of the screenshot.`
    }
    case 'screen-text': {
      // The screen under the mouse, without AIRI's own windows, read by the OCR of Windows.
      const shot = await captureWithoutAiri(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()))
      const path = join(tmpdir(), 'fairy-screen-text.jpg')
      await writeFile(path, Buffer.from(shot.data, 'base64'))
      return (await powerShell.run(ocrScript(path))).trim()
    }
    case 'play-youtube':
      return await playYouTube(request.query, request.pick)
    case 'read-window':
      return await readWindow(request.app)
    case 'click-element': {
      const read = lastRead
      if (!read)
        throw new Error('Read the app with read_app first.')
      // Every part is checked before the first click, so a wrong number never leaves half the clicks done.
      const elements = request.ids.slice(0, MAX_CLICKS).map((id) => {
        const element = read.elements.find(candidate => candidate.id === Math.trunc(id))
        if (!element)
          throw new Error(`There is no part [${id}], so nothing was clicked. Read the app again for the current numbers.`)
        if (!element.enabled)
          throw new Error(`[${element.id}] ${element.name} is disabled, so nothing was clicked.`)
        return element
      })
      // The window can be behind others. It comes to the front first, so the clicks land on it.
      await powerShell.run(FOCUS_SCRIPT.replace('__PID__', String(read.processId)))
      await sleep(300)
      // With the window in front, only a window on top of it covers a part, for example the character.
      const ownProcessIds = new Set(app.getAppMetrics().map(metric => metric.pid))
      for (const element of elements) {
        const owner = Number((await powerShell.run(windowAtScript(centerOf(element)))).trim())
        if (ownProcessIds.has(owner))
          throw new Error(`AIRI's own window covers [${element.id}] "${element.name}", so nothing was clicked. Ask the owner to move the character or the chat.`)
      }
      for (const element of elements) {
        assertNotStopped(stopsAtStart)
        await powerShell.run(clickScript(centerOf(element), request.button, request.double))
        await sleep(CLICK_SETTLE_MS)
      }
      const verb = request.double ? 'Double-clicked' : request.button === 'right' ? 'Right-clicked' : 'Clicked'
      const clicked = elements.map(element => `[${element.id}] "${element.name}"`).join(', ')
      return `${verb} ${clicked} in ${read.app}. The window now, with new numbers:\n\n${await readTarget(read)}`
    }
    case 'scroll': {
      await frontAppForInput()
      const notches = Math.max(1, Math.min(20, Math.round(request.notches)))
      await powerShell.run(scrollScript(request.direction === 'up' ? notches : -notches))
      return `Scrolled ${request.direction} by ${notches} notch${notches > 1 ? 'es' : ''} where the pointer is.`
    }
    case 'media': {
      uIOhook.keyTap(MEDIA_KEYS[request.action])
      return `Pressed the ${request.action} media key.`
    }
  }
}

/**
 * One action at a time, in the order the requests came. The model can ask for several steps at once, and keys of two
 * steps must not mix.
 */
const acting = new Mutex()

export function createPcActionsService(params: { context: ReturnType<typeof createContext>['context'] }) {
  // The first script starts PowerShell and loads UI Automation, which takes seconds. It happens now, not at the first ask.
  void powerShell.run('Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes').catch(error => log.warn(`PowerShell warm-up failed: ${errorMessageFrom(error)}`))

  defineInvokeHandler(params.context, electronPcCapture, () => acting.runExclusive(captureForPointing))
  defineInvokeHandler(params.context, electronPcAction, async (request): Promise<PcActionResult> => {
    try {
      const stopsAtStart = stops
      const message = await acting.runExclusive(() => run(request, stopsAtStart))
      log.log(message)
      return { ok: true, message }
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'The action failed.'
      log.warn(`${request.kind} failed: ${message}`)
      return { ok: false, message }
    }
  })
}
