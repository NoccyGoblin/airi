import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { PcActionRequest, PcActionResult } from '../../../../shared/eventa'
import type { OpenWindow, StartApp } from './apps'
import type { KeyCombination } from './keys'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'
import { app, BrowserWindow, clipboard, shell } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'

import { electronPcAction } from '../../../../shared/eventa'
import { matchOpenWindows, matchStartApps, normalizeWebAddress } from './apps'
import { chatKindOf } from './chats'
import { describeKeyCombination, parseKeyCombination } from './keys'

/**
 * FAIRY: fast, generic actions on the PC that the owner asks the character for, such as opening a website or an app,
 * pressing a shortcut in the app in front, and media keys. They work in any app because they use the system, not
 * clicks on a screen.
 */

const execFileAsync = promisify(execFile)
const log = useLogg('fairy-pc-actions').useGlobalConfig()

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
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(FOREGROUND_SCRIPT, 'utf16le').toString('base64')], { timeout: 15_000, windowsHide: true })
    return JSON.parse(stdout) as { processId: number, processName: string, title: string }
  }
  catch {
    return undefined
  }
}

/** Every process that has a window now. */
async function listOpenWindows(): Promise<OpenWindow[]> {
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Id, ProcessName, MainWindowTitle, Product | ConvertTo-Json -Compress'], { timeout: 15_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
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
      await runPowerShell(FOCUS_SCRIPT.replace('__PID__', String(window.id)))
      // The app needs a moment before it takes keys.
      await sleep(600)
      return true
    }
    await sleep(WINDOW_POLL_MS)
  } while (Date.now() < deadline)
  return false
}

/** Runs a PowerShell script from base64, so no value inside it can break out of its quotes. */
async function runPowerShell(script: string) {
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: 15_000, windowsHide: true })
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

async function run(request: PcActionRequest): Promise<string> {
  switch (request.kind) {
    case 'open-website': {
      const url = normalizeWebAddress(request.url)
      const browser = request.browser && request.browser !== 'default' ? BROWSERS[request.browser] : undefined
      if (!browser) {
        await shell.openExternal(url)
        return `Opened ${url} in the default browser.`
      }
      await runPowerShell(`Start-Process -FilePath '${browser}' -ArgumentList '${url.replaceAll('\'', '\'\'')}'`)
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
      await runPowerShell(`Get-Process -Id ${windows.map(window => window.id).join(',')} -ErrorAction SilentlyContinue | ForEach-Object { [void]$_.CloseMainWindow() }`)
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
  defineInvokeHandler(params.context, electronPcAction, async (request): Promise<PcActionResult> => {
    try {
      const message = await acting.runExclusive(() => run(request))
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
