import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { WebContents } from 'electron'

import type { BrowserRequest, BrowserResult } from '../../../../shared/eventa'
import type { PageSnapshot } from './snapshot'

import { setTimeout as sleep } from 'node:timers/promises'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'
import { BrowserWindow, session } from 'electron'

import { electronBrowserAction } from '../../../../shared/eventa'
import { normalizeWebAddress } from '../pc-actions/apps'
import { describeSnapshot, elementCenterScript, SNAPSHOT_SCRIPT } from './snapshot'

/**
 * FAIRY: the character's own browser window. It has its own session, so it never sees the owner's normal browser,
 * passwords, or cookies. The character reads pages as text with numbered elements, and clicks and types by number.
 *
 * Locked down: no permissions (camera, microphone, location, notifications), no downloads, no pop-up windows, and
 * only http and https pages.
 */

const PARTITION = 'persist:fairy-browser'
/** Scripts of the character run in this isolated world, apart from the page's own scripts. */
const ISOLATED_WORLD = 1001
const LOAD_TIMEOUT_MS = 20_000
const SETTLE_TIMEOUT_MS = 10_000

const log = useLogg('fairy-browser').useGlobalConfig()
const acting = new Mutex()

let browserWindow: BrowserWindow | undefined
/** The name of the character who uses the browser, for its window title. The last open sets it. */
let character = 'AIRI'

function titleFor(pageTitle?: string) {
  return pageTitle ? `${pageTitle} - ${character}'s browser` : `${character}'s browser`
}

function isWebAddress(url: string) {
  return url.startsWith('https://') || url.startsWith('http://')
}

function getBrowser(): BrowserWindow {
  if (browserWindow && !browserWindow.isDestroyed())
    return browserWindow

  const browserSession = session.fromPartition(PARTITION)
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  browserSession.setPermissionCheckHandler(() => false)
  browserSession.on('will-download', (event, item) => {
    event.preventDefault()
    log.warn(`blocked a download: ${item.getFilename()}`)
  })

  const window = new BrowserWindow({
    width: 1200,
    height: 850,
    title: titleFor(),
    autoHideMenuBar: true,
    webPreferences: { session: browserSession, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  })
  // A link that opens a new window opens in this window instead.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebAddress(url))
      void window.loadURL(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isWebAddress(url))
      event.preventDefault()
  })
  // The title shows whose browser this is, next to the page title.
  window.on('page-title-updated', (event, pageTitle) => {
    event.preventDefault()
    window.setTitle(titleFor(pageTitle))
  })
  window.on('closed', () => {
    browserWindow = undefined
  })
  browserWindow = window
  return window
}

function requireBrowser(): BrowserWindow {
  if (!browserWindow || browserWindow.isDestroyed())
    throw new Error('The browser is not open. Open a page with browser_open first.')
  return browserWindow
}

/** Waits until a page stops loading, so the next read sees the new page. */
async function settle(contents: WebContents) {
  await sleep(300)
  const deadline = Date.now() + SETTLE_TIMEOUT_MS
  while (contents.isLoading() && Date.now() < deadline)
    await sleep(200)
  await sleep(400)
}

async function snapshotOf(contents: WebContents): Promise<PageSnapshot> {
  const snapshot = await contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: SNAPSHOT_SCRIPT }])
  return snapshot as PageSnapshot
}

async function centerOf(contents: WebContents, id: number) {
  const center = await contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: elementCenterScript(id) }])
  if (!center)
    throw new Error(`There is no element [${id}] on the page. Read the page again for the current numbers.`)
  return center as { x: number, y: number, tag: string, type: string }
}

/**
 * Brings the browser window to the front, so mouse and key events reach the page.
 *
 * Returns:
 * - Whether the window has the focus. Windows can refuse it, for example in a remote session.
 */
async function focusBrowser(window: BrowserWindow) {
  window.show()
  window.focus()
  window.webContents.focus()
  await sleep(150)
  return window.isFocused()
}

/**
 * Clicks a numbered element: with a real mouse click when the window has the focus, else through the page itself.
 * A window without the focus misses mouse events.
 */
async function clickElement(window: BrowserWindow, id: number) {
  const contents = window.webContents
  const center = await centerOf(contents, id)
  await sleep(150)
  if (await focusBrowser(window)) {
    contents.sendInputEvent({ type: 'mouseMove', x: center.x, y: center.y })
    contents.sendInputEvent({ type: 'mouseDown', x: center.x, y: center.y, button: 'left', clickCount: 1 })
    contents.sendInputEvent({ type: 'mouseUp', x: center.x, y: center.y, button: 'left', clickCount: 1 })
    return
  }
  await contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: `(() => { const element = document.querySelector('[data-fairy-id="${Math.trunc(id)}"]'); if (element) { element.focus(); element.click() } })()` }])
}

async function run(request: BrowserRequest): Promise<string> {
  switch (request.kind) {
    case 'open': {
      const url = normalizeWebAddress(request.url)
      if (request.character?.trim())
        character = request.character.trim()
      const window = getBrowser()
      window.setTitle(titleFor(window.webContents.getTitle()))
      window.show()
      await Promise.race([
        window.loadURL(url).catch(() => {}),
        sleep(LOAD_TIMEOUT_MS),
      ])
      await settle(window.webContents)
      return describeSnapshot(await snapshotOf(window.webContents), { withText: true })
    }
    case 'read':
      return describeSnapshot(await snapshotOf(requireBrowser().webContents), { withText: true })
    case 'click': {
      const window = requireBrowser()
      await clickElement(window, request.id)
      await settle(window.webContents)
      return `Clicked [${request.id}].\n\n${describeSnapshot(await snapshotOf(window.webContents), { withText: false })}`
    }
    case 'type': {
      const window = requireBrowser()
      const contents = window.webContents
      await clickElement(window, request.id)
      // Select the old text, so the new text replaces it.
      await contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: `(() => { const element = document.querySelector('[data-fairy-id="${Math.trunc(request.id)}"]'); if (!element) return; element.focus(); if (typeof element.select === 'function') element.select(); else document.execCommand('selectAll') })()` }])
      await contents.insertText(request.text.slice(0, 2000))
      if (request.submit) {
        const before = contents.getURL()
        contents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
        contents.sendInputEvent({ type: 'char', keyCode: '\r' })
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
        await settle(contents)
        // A window in the background can miss the key. Then the field's form is sent directly, as Enter would.
        if (contents.getURL() === before) {
          await contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: `(() => { const element = document.querySelector('[data-fairy-id="${Math.trunc(request.id)}"]'); if (element && element.form) element.form.requestSubmit() })()` }])
          await settle(contents)
        }
      }
      return `Typed into [${request.id}]${request.submit ? ' and pressed Enter' : ''}.\n\n${describeSnapshot(await snapshotOf(contents), { withText: false })}`
    }
    case 'back': {
      const contents = requireBrowser().webContents
      if (!contents.navigationHistory.canGoBack())
        throw new Error('There is no page to go back to.')
      contents.navigationHistory.goBack()
      await settle(contents)
      return describeSnapshot(await snapshotOf(contents), { withText: true })
    }
    case 'scroll': {
      const contents = requireBrowser().webContents
      await contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: `window.scrollBy({ top: ${request.direction === 'up' ? -1 : 1} * Math.round(innerHeight * 0.8) })` }])
      await sleep(400)
      return describeSnapshot(await snapshotOf(contents), { withText: true })
    }
    case 'close': {
      browserWindow?.close()
      return 'Closed the browser.'
    }
  }
}

export function createBrowserService(params: { context: ReturnType<typeof createContext>['context'] }) {
  defineInvokeHandler(params.context, electronBrowserAction, async (request): Promise<BrowserResult> => {
    try {
      const text = await acting.runExclusive(() => run(request))
      log.log(`${request.kind} done`)
      return { ok: true, text }
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'The browser action failed.'
      log.warn(`${request.kind} failed: ${message}`)
      return { ok: false, text: message }
    }
  })
}
