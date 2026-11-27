import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { defineInvokeHandler } from '@moeru/eventa'
import { BrowserWindow, screen } from 'electron'

import { electronActivityStatus } from '../../../../shared/eventa'
import { bubblePlace } from './place'

/**
 * FAIRY: a small bubble next to the character that says in a few words what she does, for example "Opening Discord…".
 * It follows her window, lets every click through, and never takes the focus. It hides when she is done.
 */

const BUBBLE_SIZE = { width: 280, height: 44 }
/** A short pause before it hides, so it does not flicker between two quick steps. */
const HIDE_DELAY_MS = 900
/** It hides by itself when no new step came for this long. */
const STALE_MS = 25_000

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>activity</title><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:600 13px/1.2 system-ui,'Segoe UI',sans-serif}
body{display:flex;align-items:center;justify-content:center}
#bubble{max-width:268px;padding:8px 14px;border-radius:16px;background:rgba(32,22,48,.86);color:#fff;
box-shadow:0 2px 10px rgba(0,0,0,.28);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
opacity:0;transform:translateY(4px);transition:opacity .18s,transform .18s}
#bubble.shown{opacity:1;transform:none}
#bubble::before{content:'✨ '}
</style></head><body><div id="bubble"></div><script>
window.setText=(text)=>{const b=document.getElementById('bubble');if(text){b.textContent=text;b.classList.add('shown')}else{b.classList.remove('shown')}}
</script></body></html>`

/** Windows that only show and never take clicks. A click check skips them. */
const clickThroughWindows = new WeakSet<BrowserWindow>()

export function isClickThroughWindow(window: BrowserWindow) {
  return clickThroughWindows.has(window)
}

/** Marks another window that only shows, such as the drawing layer, so click checks skip it too. */
export function markClickThrough(window: BrowserWindow) {
  clickThroughWindows.add(window)
}

/** Shows a short line in the bubble for a moment, for example when she is thrown. The main window sets it up. */
let sayLine: ((text: string, holdMs: number) => void) | undefined

export function bubbleSay(text: string, holdMs = 2500) {
  sayLine?.(text, holdMs)
}

export function createActivityBubbleService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const character = params.window
  let bubble: BrowserWindow | undefined
  let ready: Promise<void> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let staleTimer: ReturnType<typeof setTimeout> | undefined

  function place() {
    if (!bubble || bubble.isDestroyed() || character.isDestroyed())
      return
    const bounds = character.getBounds()
    const { x, y } = bubblePlace(bounds, BUBBLE_SIZE, screen.getDisplayMatching(bounds).workArea)
    bubble.setBounds({ x, y, ...BUBBLE_SIZE }, false)
  }

  function ensureBubble() {
    if (bubble && !bubble.isDestroyed())
      return ready!
    bubble = new BrowserWindow({
      ...BUBBLE_SIZE,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    })
    clickThroughWindows.add(bubble)
    bubble.setIgnoreMouseEvents(true)
    bubble.setAlwaysOnTop(true, 'screen-saver')
    ready = bubble.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`).catch(() => {})
    return ready
  }

  async function show(text: string) {
    clearTimeout(hideTimer)
    clearTimeout(staleTimer)
    await ensureBubble()
    if (!bubble || bubble.isDestroyed())
      return
    place()
    await bubble.webContents.executeJavaScript(`window.setText(${JSON.stringify(text)})`).catch(() => {})
    if (!bubble.isVisible())
      bubble.showInactive()
    staleTimer = setTimeout(hide, STALE_MS)
  }

  function hide() {
    clearTimeout(staleTimer)
    if (!bubble || bubble.isDestroyed() || !bubble.isVisible())
      return
    void bubble.webContents.executeJavaScript('window.setText(\'\')').catch(() => {})
    // The fade-out runs before the window goes.
    hideTimer = setTimeout(() => bubble && !bubble.isDestroyed() && bubble.hide(), 220)
  }

  sayLine = (text, holdMs) => {
    void show(text).then(() => {
      clearTimeout(hideTimer)
      hideTimer = setTimeout(hide, holdMs)
    })
  }

  const follow = () => {
    if (bubble?.isVisible())
      place()
  }
  character.on('move', follow)

  defineInvokeHandler(params.context, electronActivityStatus, async ({ text }) => {
    if (text?.trim()) {
      await show(text.trim())
      return
    }
    clearTimeout(hideTimer)
    hideTimer = setTimeout(hide, HIDE_DELAY_MS)
  })

  return () => {
    sayLine = undefined
    clearTimeout(hideTimer)
    clearTimeout(staleTimer)
    if (!character.isDestroyed())
      character.off('move', follow)
    bubble?.destroy()
    bubble = undefined
  }
}
