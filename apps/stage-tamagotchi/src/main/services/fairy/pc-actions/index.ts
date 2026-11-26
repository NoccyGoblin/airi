import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { PcActionRequest, PcActionResult } from '../../../../shared/eventa'
import type { OpenWindow, StartApp } from './apps'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { app, BrowserWindow, clipboard, shell } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'

import { electronPcAction } from '../../../../shared/eventa'
import { matchOpenWindows, matchStartApps, normalizeWebAddress } from './apps'
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

/** Runs a PowerShell script from base64, so no value inside it can break out of its quotes. */
async function runPowerShell(script: string) {
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: 15_000, windowsHide: true })
}

/** Keys go to the app in front. When an AIRI window is in front, the app behind it gets the focus first. */
async function focusAppBehindAiri() {
  const focused = BrowserWindow.getFocusedWindow()
  if (!focused)
    return
  focused.blur()
  await sleep(250)
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
    case 'open-app': {
      const matches = matchStartApps(await listStartApps(), request.name)
      if (!matches.length)
        throw new Error(`No installed app matches "${request.name}".`)
      const [app] = matches
      await execFileAsync('explorer.exe', [`shell:AppsFolder\\${app.appId}`], { windowsHide: true }).catch((error: { code?: number }) => {
        // explorer.exe exits with 1 even when it opens the app.
        if (error.code !== 1)
          throw error
      })
      const others = matches.slice(1, 4).map(other => other.name)
      return `Opened ${app.name}.${others.length ? ` Other matches: ${others.join(', ')}.` : ''}`
    }
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
      await focusAppBehindAiri()
      uIOhook.keyTap(UiohookKey[combination.key as keyof typeof UiohookKey], combination.modifiers.map(modifier => UiohookKey[modifier as keyof typeof UiohookKey]))
      return `Pressed ${describeKeyCombination(combination)} in the app in front.`
    }
    case 'type-text': {
      const text = request.text.slice(0, MAX_TYPED_CHARACTERS)
      if (!text)
        throw new Error('No text given.')
      // Pasting types any character on any keyboard layout. The clipboard comes back afterwards.
      const saved = { text: clipboard.readText(), html: clipboard.readHTML(), image: clipboard.readImage() }
      await focusAppBehindAiri()
      clipboard.writeText(text)
      uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl])
      await sleep(400)
      clipboard.clear()
      if (!saved.image.isEmpty())
        clipboard.writeImage(saved.image)
      else if (saved.text || saved.html)
        clipboard.write({ text: saved.text, html: saved.html })
      return `Typed ${text.length} characters into the app in front. Nothing was sent.`
    }
    case 'media': {
      uIOhook.keyTap(MEDIA_KEYS[request.action])
      return `Pressed the ${request.action} media key.`
    }
  }
}

export function createPcActionsService(params: { context: ReturnType<typeof createContext>['context'] }) {
  defineInvokeHandler(params.context, electronPcAction, async (request): Promise<PcActionResult> => {
    try {
      const message = await run(request)
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
