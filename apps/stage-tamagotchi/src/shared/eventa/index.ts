import type { Locale } from '@intlify/core'
import type { ResizeDirection } from '@proj-airi/electron-eventa'
import type {
  GameletIframeRequestPayload as GameletIframeInvokePayload,
  GameletIframeResponsePayload,
} from '@proj-airi/plugin-sdk-tamagotchi/gamelet'
import type { ServerOptions } from '@proj-airi/server-runtime/server'
import type {
  ShortcutAccelerator,
  ShortcutBinding,
  ShortcutRegistrationResult,
} from '@proj-airi/stage-shared/global-shortcut'
import type {
  StageViewErrorPayload,
  StageViewPatch,
  StageViewRequestAckPayload,
  StageViewSnapshotPayload,
} from '@proj-airi/stage-shared/godot-stage'
import type { ServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'
import type { IOTraceHubState, IOTraceRecordingState } from '@proj-airi/stage-shared/types/io-trace'
import type {
  ThreeHitTestReadTracePayload,
  ThreeSceneRenderInfoTracePayload,
  VrmDisposeEndTracePayload,
  VrmDisposeStartTracePayload,
  VrmLoadEndTracePayload,
  VrmLoadErrorTracePayload,
  VrmLoadStartTracePayload,
  VrmUpdateFrameTracePayload,
} from '@proj-airi/stage-ui-three/trace'
import type { ChatHistoryReplyPayload } from '@proj-airi/stage-ui/components/scenarios/chat'
import type { McpDispatchOutcome } from '@proj-airi/stage-ui/tools/mcp'
import type { TraceFeedMessage } from '@proj-airi/trace-kit'
import type { Rectangle } from 'electron'

import type { UpdateChannel } from '../update-channels'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const electronStartDraggingWindow = defineInvokeEventa('eventa:invoke:electron:start-dragging-window')

export const electronOpenMainDevtools = defineInvokeEventa('eventa:invoke:electron:windows:main:devtools:open')
export const electronCenterMainWindow = defineInvokeEventa<Rectangle>('eventa:invoke:electron:windows:main:center')
export const electronOpenEditor = defineInvokeEventa<void>('eventa:invoke:electron:windows:editor:open')
export const electronOpenSettings = defineInvokeEventa<void, { route?: string }>('eventa:invoke:electron:windows:settings:open')
/**
 * What the fullscreen mode shows on the right, in either window that hosts it.
 *
 * - `settings`: the settings pages.
 * - `chat`: the chat, in the `fullscreen` chat mode.
 */
export type FullscreenSurfaceId = 'settings' | 'chat'
/** The surface that the fullscreen mode shows when a request names none. */
export const defaultFullscreenSurface: FullscreenSurfaceId = 'settings'

/** The state that one mounted surface hands to the next host. The surface decides what it is. */
export interface FullscreenCarriedSurface {
  id: FullscreenSurfaceId
  state?: unknown
}

/**
 * What the fullscreen mode shows, packed by one host for the next one when the window mode changes: the surfaces that
 * stay mounted with their states, and the surface in front.
 */
export interface FullscreenPack {
  surface: FullscreenSurfaceId
  surfaces: FullscreenCarriedSurface[]
}

/** What a host of the fullscreen mode shows on request: a surface and its page, or what the previous host packed. */
export interface FullscreenOpenRequest {
  surface: FullscreenSurfaceId
  route?: string
  pack?: FullscreenPack
}

/**
 * Starts the fullscreen mode of the main window. The window stops keeping its bounds in the config and leaves always on top.
 * Returns its bounds and the work area of its display, so the page can plan the move.
 */
export const electronMainWindowEnterFullscreen = defineInvokeEventa<{ bounds: Rectangle, workArea: Rectangle }>('eventa:invoke:electron:windows:main:fullscreen:enter')
/** The control points of a CSS `cubic-bezier()` curve, so a window glide can move with a CSS transition. */
export type FullscreenGlideCurve = [x1: number, y1: number, x2: number, y2: number]
/**
 * Sets the main window bounds in fullscreen mode. With a duration, the window keeps its size and glides to the position
 * along `curve` after `delay`, and the call resolves when the glide ends.
 */
export const electronMainWindowSetFullscreenBounds = defineInvokeEventa<void, { bounds: Rectangle, duration?: number, delay?: number, curve?: FullscreenGlideCurve }>('eventa:invoke:electron:windows:main:fullscreen:bounds')
/**
 * Reports what the page shows on the right and which surfaces it keeps mounted, or nothing once fullscreen mode
 * closes. The main process shows the same surface after a reload, and collects the chat draft from a mounted chat.
 */
export const electronFullscreenSurfaceChanged = defineInvokeEventa<void, { surface?: FullscreenSurfaceId, mounted: FullscreenSurfaceId[] }>('eventa:invoke:electron:fullscreen:surface-changed')
/**
 * Reads whether the main window is in fullscreen mode. A page that loads while it is, after a reload for example,
 * shows the fullscreen mode at once. Returns the bounds before fullscreen, the work area, and the surface.
 */
export const electronMainWindowGetFullscreenState = defineInvokeEventa<{ home: Rectangle, workArea: Rectangle, surface?: FullscreenSurfaceId } | undefined>('eventa:invoke:electron:windows:main:fullscreen:state')
/**
 * Reads what the window of the `multi-window` mode opened for. Its page asks when it mounts, because the request came
 * before the page could hear it. After a reload of the page, it returns the surface that the page showed.
 */
export const electronWorkspaceWindowGetOpenRequest = defineInvokeEventa<FullscreenOpenRequest | undefined>('eventa:invoke:electron:windows:workspace:open-request')
/**
 * Ends the fullscreen mode of the window. The main window returns to the bounds and the always-on-top state that it had
 * before, and the window of the `multi-window` mode closes. The main process logs `reason`.
 */
export const electronFullscreenExit = defineInvokeEventa<void, { reason: string }>('eventa:invoke:electron:fullscreen:exit')
/**
 * Where the fullscreen mode shows, as the user chose in the experiments.
 *
 * - `off`: nowhere. Settings open in the settings window, and no chat uses the fullscreen mode.
 * - `single-window`: in the main window, which grows over its display.
 * - `multi-window`: in a window of its own. The main window stays on the desktop as it is.
 */
export type FullscreenMode = 'off' | 'single-window' | 'multi-window'
/**
 * Reports the fullscreen mode that the user chose. The main process treats it as `off` until the main window page
 * reports. Settings and the fullscreen chat open where the mode says. When the mode goes off, the call resolves after
 * a chat in the fullscreen mode has moved to the default mode.
 */
export const electronFullscreenSetMode = defineInvokeEventa<void, { mode: FullscreenMode }>('eventa:invoke:electron:fullscreen:mode')
/**
 * Asks the page of a window that hosts the fullscreen mode to show a surface. Settings entry points and the fullscreen
 * chat mode send it while the experiment is on. With `pack`, the page shows what the previous host packed instead.
 */
export const electronFullscreenOpen = defineEventa<FullscreenOpenRequest>('eventa:event:electron:fullscreen:open')
/**
 * Asks the page of a window that hosts the fullscreen mode to close the mode, for a chat mode switch that leaves the
 * fullscreen chat. The new chat window holds the draft by then.
 */
export const electronFullscreenClose = defineEventa('eventa:event:electron:fullscreen:close')
/** Asks the page of a host what the mode shows, packed for the next host. Answers `undefined` while the mode is closed. */
export const electronFullscreenPack = defineInvokeEventa<FullscreenPack | undefined>('eventa:invoke:electron:fullscreen:pack')
/**
 * Asks the page of a host to close the mode the way its island does, so a page with unsaved changes can stop it.
 * Answers whether the mode closes.
 */
export const electronFullscreenRequestClose = defineInvokeEventa<boolean>('eventa:invoke:electron:fullscreen:request-close')
/** Shows the inlay without focus. The tray menu opens it with focus. */
export const electronOpenInlay = defineInvokeEventa<void>('eventa:invoke:electron:windows:inlay:open')
/** Moves a dragged inlay back to the bottom center of the primary display. The inlay calls it when it has been idle. */
export const electronInlayReturnHome = defineInvokeEventa<void>('eventa:invoke:electron:windows:inlay:return-home')

/**
 * Where the app menu of the controls island opens, and the state of the main window that the menu shows. The menu opens
 * on `side` of the anchor, aligned to its `align` edge, away from the screen corner that the island docks to.
 */
export interface ControlsMenuRequest {
  /**
   * The more button of the island, in CSS pixels. The island sends it in the page coordinates of the main window. The
   * main process passes it on in the page coordinates of the menu window.
   */
  anchor: Rectangle
  side: 'left' | 'right'
  align: 'start' | 'end'
  /** The main window started a sign-in that has not ended. The sign-in row shows it and takes no selection. */
  signingIn: boolean
}
/**
 * What the main window does after the menu closes. The menu window cannot do these itself.
 *
 * - `sign-in`: starts a sign-in. The main window owns sign-in, and the token callback returns to it.
 * - `open-hearing`: opens Hearing controls, which the microphone button opens too.
 * - `center-main-window`: moves the main window to the center of its display.
 */
export type ControlsMenuAction = 'sign-in' | 'open-hearing' | 'center-main-window'
/**
 * Opens the app menu in a window of its own, so the menu can extend past the main window. The main window sends it.
 * Resolves when the menu closes, with the action that the user chose, or `undefined`. Rejects when the menu window
 * closes or cannot show.
 */
export const electronControlsMenuOpen = defineInvokeEventa<ControlsMenuAction | undefined, ControlsMenuRequest>('eventa:invoke:electron:windows:controls-menu:open')
/**
 * Asks the menu page to open the menu at the anchor. The main process shows the window after the page answers, so the
 * first frame holds the open menu.
 */
export const electronControlsMenuShow = defineInvokeEventa<void, ControlsMenuRequest>('eventa:invoke:electron:windows:controls-menu:show')
/** Tells the main process that the menu page can take requests. The first request waits for it. */
export const electronControlsMenuPageMounted = defineInvokeEventa<void>('eventa:invoke:electron:windows:controls-menu:page-mounted')
/**
 * Tells the main process that the menu closed and its exit animation ended, with the action that the user chose. The
 * main process hides the window and answers the open request.
 */
export const electronControlsMenuClosed = defineInvokeEventa<void, ControlsMenuAction | undefined>('eventa:invoke:electron:windows:controls-menu:closed')
/**
 * Tells the main process that a read of Notifications in the menu reached the server or rolled back. The main process
 * passes it to the main window.
 */
export const electronControlsMenuNotificationsRead = defineInvokeEventa<void>('eventa:invoke:electron:windows:controls-menu:notifications-read')
/**
 * Asks the main window to read the unread count of Notifications again. The menu window marks Notifications read in its
 * own store, and the dot of the more button reads another one.
 */
export const electronMainWindowRefreshUnread = defineEventa('eventa:event:electron:windows:main:refresh-unread')

export const electronSettingsNavigate = defineEventa<{ route: string }>('eventa:event:electron:windows:settings:navigate')
export const electronOpenChat = defineInvokeEventa('eventa:invoke:electron:windows:chat:open')

/** One screenshot of the screen under the calling window, as base64 JPEG. Taken only when the user asks for it. */
export interface LookAtScreenResult {
  mimeType: 'image/jpeg'
  /** Base64 data without the `data:` prefix. */
  data: string
}
export const electronLookAtScreen = defineInvokeEventa<LookAtScreenResult>('eventa:invoke:electron:fairy:look-at-screen')

/** FAIRY: a compact view of the running League match from Riot's local Live Client Data API. */
export const electronLeagueLiveGame = defineInvokeEventa<unknown>('eventa:invoke:electron:fairy:league-live-game')
export interface LeagueLookupRequest {
  name: string
  kind: 'any' | 'item' | 'champion' | 'rune' | 'summoner_spell'
}
/** FAIRY: one item, champion, rune, or summoner spell from Riot's Data Dragon, newest patch. */
export const electronLeagueLookup = defineInvokeEventa<unknown, LeagueLookupRequest>('eventa:invoke:electron:fairy:league-lookup')

export interface WikipediaRequest {
  query: string
  /** Wikipedia language code, for example "en" or "nl". */
  language?: string
}
/** FAIRY: a Wikipedia page summary. Free, no account. */
export const electronWikipedia = defineInvokeEventa<unknown, WikipediaRequest>('eventa:invoke:electron:fairy:wikipedia')
export interface WebSearchRequest {
  query: string
  /** Prefer news from the last 30 days. */
  recent?: boolean
}
/** FAIRY: one long-term memory file in <project>\fairy-data\memory. The id is the file name without `.md`. */
export interface MemoryFileEntry {
  id: string
  description: string
  body: string
  updatedAt: number
}
export interface MemoryFileSave {
  /** An existing file to rewrite. Without it, a new file is named after the description. */
  id?: string
  description: string
  body: string
}
export const electronMemoryFilesList = defineInvokeEventa<MemoryFileEntry[]>('eventa:invoke:electron:fairy:memory-files:list')
export const electronMemoryFilesSave = defineInvokeEventa<MemoryFileEntry, MemoryFileSave>('eventa:invoke:electron:fairy:memory-files:save')
export const electronMemoryFilesRemove = defineInvokeEventa<string[], string[]>('eventa:invoke:electron:fairy:memory-files:remove')
export const electronMemoryFilesClear = defineInvokeEventa('eventa:invoke:electron:fairy:memory-files:clear')
export const electronMemoryFilesReplace = defineInvokeEventa<void, MemoryFileSave[]>('eventa:invoke:electron:fairy:memory-files:replace')
export const electronMemoryFilesOpenFolder = defineInvokeEventa('eventa:invoke:electron:fairy:memory-files:open-folder')
/** A memory file changed, for example in Notepad. */
export const electronMemoryFilesChanged = defineEventa('eventa:event:electron:fairy:memory-files:changed')

/** FAIRY: a message from the phone page, which the main window answers with `electronPhoneChatReply`. */
export interface PhoneChatRequest {
  id: string
  kind: 'send' | 'history'
  text?: string
  /** A data URL of a JPEG, PNG, or WebP photo. */
  image?: string
  /** Base64 of a voice message: mono 16-bit little-endian PCM at 16 kHz. The PC hearing module transcribes it. */
  audio?: string
  /** Asks for the reply as audio too, in the voice of the PC speech module. */
  speak?: boolean
}
export interface PhoneChatReply {
  id: string
  ok: boolean
  /** What the PC heard in a voice message. */
  heard?: string
  reply?: string
  /** A data URL of the spoken reply. It is missing when speech is not set up on the PC. */
  speech?: string
  messages?: { role: 'user' | 'assistant', text: string }[]
  /** The name of the character in the active chat, so the page shows who answers. */
  character?: string
  error?: string
}
export const electronPhoneChatRequest = defineEventa<PhoneChatRequest>('eventa:event:electron:fairy:phone:request')
export const electronPhoneChatReply = defineInvokeEventa<void, PhoneChatReply>('eventa:invoke:electron:fairy:phone:reply')
/** The local port, the pairing key, and the Tailscale HTTPS address, for the QR code in Settings. */
export const electronPhoneInfo = defineInvokeEventa<{ port: number, key: string, url?: string }>('eventa:invoke:electron:fairy:phone:info')

/** FAIRY: one fast action on the PC that the owner asked the character for. */
export type PcActionRequest
  = | { kind: 'open-website', url: string, browser?: 'default' | 'chrome' | 'edge' | 'firefox' | 'brave' | 'opera' }
    | { kind: 'open-app', name: string }
    | { kind: 'close-app', name: string }
    | { kind: 'press-keys', keys: string, groupSendApproved?: boolean }
    | { kind: 'type-text', text: string }
    | { kind: 'discord-message', person: string, message: string }
    | { kind: 'media', action: 'play-pause' | 'next' | 'previous' | 'volume-up' | 'volume-down' | 'mute' }
    | { kind: 'click', captureId: string, x: number, y: number, button: 'left' | 'right', double: boolean }
    | { kind: 'scroll', direction: 'up' | 'down', notches: number }
    | { kind: 'read-window', app?: string }
    | { kind: 'screen-text' }
    | { kind: 'play-youtube', query: string, pick?: number }
    | { kind: 'click-element', ids: number[], button: 'left' | 'right', double: boolean }
export interface PcActionResult {
  ok: boolean
  message: string
}
export const electronPcAction = defineInvokeEventa<PcActionResult, PcActionRequest>('eventa:invoke:electron:fairy:pc-action')
/** FAIRY: a file action in the owner's own folders. */
export type FileActionRequest
  = | { kind: 'find', query: string }
    | { kind: 'list', path?: string }
    | { kind: 'open', path: string }
    | { kind: 'move', paths: string[], folder: string }
    | { kind: 'trash', paths: string[] }
export interface FileEntry {
  path: string
  name: string
  kind: 'file' | 'folder'
  /** Bytes. Folders have none. */
  size?: number
  /** Local time, for example "2026-11-26 09:30". */
  modified: string
}
export interface FileActionResult {
  ok: boolean
  message: string
  items?: FileEntry[]
}
export const electronFileAction = defineInvokeEventa<FileActionResult, FileActionRequest>('eventa:invoke:electron:fairy:file-action')

/** FAIRY: a routine of the character: something it does by itself at a set time. */
export interface Routine {
  id: string
  name: string
  /** Local time, for example "09:00". */
  time: string
  /** Days it runs on, such as "mon". Empty means every day. */
  days: Array<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'>
  /** What the character does, in the owner's words. */
  instruction: string
  enabled: boolean
  /** ISO time of the last run. */
  lastRunAt?: string
}
export type RoutineRequest
  = | { kind: 'list' }
    | { kind: 'create', name: string, time: string, days: Routine['days'], instruction: string }
    | { kind: 'delete', id: string }
    | { kind: 'enable', id: string, enabled: boolean }
export interface RoutineResult {
  ok: boolean
  message: string
  routines?: Array<Routine & { nextRun?: string }>
}
export const electronRoutineAction = defineInvokeEventa<RoutineResult, RoutineRequest>('eventa:invoke:electron:fairy:routine-action')
/** FAIRY: a routine that is due now. Only the main window gets it, and it runs the routine in the active chat. */
export const electronRoutineDue = defineEventa<Routine>('eventa:event:electron:fairy:routine-due')

/**
 * FAIRY: reads a file that the owner dropped on the character, by its path. The window cannot read a OneDrive file
 * that downloads while it reads, so the main process reads it from disk.
 */
export const electronReadDroppedFile = defineInvokeEventa<{ data: string, size: number }, { path: string }>('eventa:invoke:electron:fairy:read-dropped-file')

/** FAIRY: the few words in the bubble next to the character about what she does now. An empty text hides it. */
export const electronActivityStatus = defineInvokeEventa<void, { text: string | null }>('eventa:invoke:electron:fairy:activity-status')

/** FAIRY: turns wander mode on or off, or reads it when `enabled` is missing. */
export const electronWanderMode = defineInvokeEventa<{ enabled: boolean }, { enabled?: boolean } | undefined>('eventa:invoke:electron:fairy:wander-mode')

/** FAIRY: something said to the character on Discord, in a text channel or in a voice call. */
export interface DiscordTurnRequest {
  id: string
  /** The character card name from the bot settings. An empty name means the active character. */
  character: string
  /** Where it was said, for example "#general on My Server" or "the voice call General on My Server". */
  place: string
  speaker: string
  text: string
  /** True for speech in a voice call. Then the reply comes back as speech too. */
  voice: boolean
}
export interface DiscordTurnReply {
  id: string
  ok: boolean
  reply?: string
  /** Base64 of the spoken reply as mono 16-bit little-endian PCM at 48 kHz, for a voice call. */
  speech?: string
  error?: string
}
export const electronDiscordTurn = defineEventa<DiscordTurnRequest>('eventa:event:electron:fairy:discord:turn')
export const electronDiscordReply = defineInvokeEventa<void, DiscordTurnReply>('eventa:invoke:electron:fairy:discord:reply')

/** FAIRY: the main window tells whether the character is busy. Only then Escape stops her, everywhere on the PC. */
export const electronStopKeyArmed = defineInvokeEventa<void, { armed: boolean }>('eventa:invoke:electron:fairy:stop-key-armed')
/** FAIRY: the owner pressed Escape while the character was busy. */
export const electronStopPressed = defineEventa<void>('eventa:event:electron:fairy:stop-pressed')

/** FAIRY: an action in the character's own browser window. Elements are named by the numbers of the last read. */
export type BrowserRequest
  = | { kind: 'open', url: string, character?: string }
    | { kind: 'read' }
    | { kind: 'click', id: number }
    | { kind: 'type', id: number, text: string, submit: boolean }
    | { kind: 'back' }
    | { kind: 'scroll', direction: 'up' | 'down' }
    | { kind: 'close' }
export interface BrowserResult {
  ok: boolean
  /** The page as text with numbered elements, or what went wrong. */
  text: string
}
export const electronBrowserAction = defineInvokeEventa<BrowserResult, BrowserRequest>('eventa:invoke:electron:fairy:browser-action')

/** FAIRY: a screenshot for pointing. A click names its `captureId`, so the point maps to the right display. */
export interface PcCapture extends LookAtScreenResult {
  captureId: string
  width: number
  height: number
}
/** FAIRY: a screenshot of the display under the mouse pointer, without AIRI's windows. */
export const electronPcCapture = defineInvokeEventa<PcCapture>('eventa:invoke:electron:fairy:pc-capture')

/** FAIRY: a beat every few seconds to the main window. While live mode is on, the window decides there whether to look. */
export const electronLiveModeTick = defineEventa<void>('eventa:event:electron:fairy:live-mode:tick')
/** FAIRY: starts or stops the capture of the screen every second. Only the main window calls it. */
export const electronLiveModeSetActive = defineInvokeEventa<void, { active: boolean }>('eventa:invoke:electron:fairy:live-mode:set-active')
/** A live capture of the screen. `at` is the capture time in epoch milliseconds. */
export interface LiveModeFrame extends LookAtScreenResult {
  at: number
}
/** FAIRY: the newest live capture, or nothing while live mode is off. It stays in memory only. */
export const electronLiveModeLatestFrame = defineInvokeEventa<LiveModeFrame | undefined>('eventa:invoke:electron:fairy:live-mode:latest-frame')

/** FAIRY: a web search through Tavily, with a short answer and sources. Needs FAIRY_TAVILY_API_KEY. */
export const electronWebSearch = defineInvokeEventa<unknown, WebSearchRequest>('eventa:invoke:electron:fairy:web-search')

export const ioTraceRecordingChanged = defineEventa<IOTraceRecordingState>('eventa:event:electron:io-trace-recording:changed')
export const ioTraceRecordingGet = defineInvokeEventa<IOTraceRecordingState>('eventa:invoke:electron:io-trace-recording:get')
export const ioTraceRecordingSetEnabled = defineInvokeEventa<IOTraceRecordingState, { enabled: boolean }>('eventa:invoke:electron:io-trace-recording:set-enabled')

/**
 * Sends a batch of trace records of this window to the trace hub in the main process.
 * The hub validates each record, so a bad record of one window cannot break the views of the others.
 */
export const ioTraceHubEmit = defineInvokeEventa<void, { records: unknown[] }>('eventa:invoke:electron:io-trace-hub:emit')
/** Returns the value of the hub clock now. A window pairs it with its own clock in a clock snapshot. */
export const ioTraceHubPing = defineInvokeEventa<number>('eventa:invoke:electron:io-trace-hub:ping')
export const ioTraceHubGet = defineInvokeEventa<IOTraceHubState>('eventa:invoke:electron:io-trace-hub:get')
export const ioTraceHubSetCollecting = defineInvokeEventa<IOTraceHubState, { collecting: boolean }>('eventa:invoke:electron:io-trace-hub:set-collecting')
/**
 * Returns the backlog of the hub feed, and sends each later feed message to this window as `ioTraceHubFeed`.
 * `tracks` are the track paths that the view of this window shows.
 */
export const ioTraceHubSubscribe = defineInvokeEventa<{ messages: TraceFeedMessage[], traceClock: string }, { tracks: string[] | '*' }>('eventa:invoke:electron:io-trace-hub:subscribe')
export const ioTraceHubSetTracks = defineInvokeEventa<void, { tracks: string[] | '*' }>('eventa:invoke:electron:io-trace-hub:set-tracks')
export const ioTraceHubUnsubscribe = defineInvokeEventa<void>('eventa:invoke:electron:io-trace-hub:unsubscribe')
/** Later feed messages for a subscribed window, in feed order. */
export const ioTraceHubFeed = defineEventa<TraceFeedMessage[]>('eventa:event:electron:io-trace-hub:feed')
/** The tracks that viewers show now. Each window skips costly series of other tracks. */
export const ioTraceHubWanted = defineEventa<{ tracks: string[] | '*' }>('eventa:event:electron:io-trace-hub:wanted')
/**
 * The system resumed from sleep. Monotonic clocks can stop or continue through sleep, so each window writes a clock
 * discontinuity and measures its clock again.
 */
export const ioTraceHubResync = defineEventa<void>('eventa:event:electron:io-trace-hub:resync')

/**
 * Where the Controls Island chat button opens the chat.
 *
 * - `legacy`: the opaque chat window with a title bar.
 * - `floating`: a transparent, click-through window where only the chat
 *   bubbles and controls are drawn. The chat button folds and unfolds it.
 * - `fullscreen`: the main window covers its display and shows the chat
 *   beside the character. It has no window of its own.
 */
export type ChatWindowMode = 'legacy' | 'floating' | 'fullscreen'

/**
 * Where the floating chat window stays.
 *
 * - `attached`: beside the main window, moving with it.
 * - `free`: where the user drags it.
 */
export type ChatFloatingPlacement = 'attached' | 'free'

/** Chat window choices that the main process persists for every chat renderer. */
export interface ChatWindowPreferences {
  mode: ChatWindowMode
  placement: ChatFloatingPlacement
  /**
   * Shows the floating chat as a message feed: the composer folds away, and
   * with fade on hover the feed only follows new messages and lets every
   * click through.
   */
  danmaku: boolean
  /**
   * Keeps a `free` floating chat above other windows. An `attached` chat
   * ignores it and follows the main window's pin state instead.
   */
  pinned: boolean
}

/** What the floating chat renderer needs from the main process to lay itself out. */
export interface ChatFloatingState {
  placement: ChatFloatingPlacement
  danmaku: boolean
  /**
   * The side of the main window that the chat sits on in `attached`
   * placement. The renderer folds toward the character on this side. `left`
   * in `free` placement.
   */
  side: 'left' | 'right'
  /**
   * The edges and corners that resize the chat. A `free` chat resizes from
   * all of them. An `attached` chat keeps the edges that it shares with the
   * main window, so it resizes only from the others.
   */
  resizeEdges: ResizeDirection[]
  /**
   * `true` after the chat button folds the chat. The renderer plays the fold
   * and then calls {@link electronChatFloatingContentHidden}, so the main
   * process hides the window only after the animation.
   */
  folded: boolean
  /**
   * `true` while an attached chat moves to the other side of the main window.
   * The renderer folds the content toward the character and calls
   * {@link electronChatFloatingContentHidden}; the main process then moves the
   * window and reports `false` with the new `side`, and the content unfolds.
   */
  relocating: boolean
  /**
   * Whether the chat window stays above other windows: the chat's own pin
   * when free, the main window's pin otherwise. The renderer passes clicks
   * through only while it is `true`, like the main window.
   */
  pinned: boolean
}

/**
 * The conversation and the unsent composer content that a chat mode switch
 * carries from the window it closes to the window it opens. Each renderer owns
 * its composer and its selected conversation, so both cross through the main
 * process. The content is empty when nothing was typed.
 */
export interface ChatDraftHandover {
  /** The chat session that the closing window shows, and that the content belongs to. */
  sessionId: string
  text: string
  replyTarget?: ChatHistoryReplyPayload
  /** Images as the composer sends them: base64 data without the data URL prefix. */
  attachments: { data: string, mimeType: string, name: string }[]
}

/**
 * What the Controls Island chat button reflects. In the floating mode the
 * button folds and unfolds the chat, so it shows a pressed state while the
 * chat is unfolded. In the legacy mode it only opens the window and has no
 * pressed state.
 */
export interface ChatButtonState {
  mode: ChatWindowMode
  /** `true` while the floating chat is unfolded; always `false` in the legacy mode. */
  floatingShown: boolean
}

export const electronGetChatButtonState = defineInvokeEventa<ChatButtonState>('eventa:invoke:electron:windows:chat:get-button-state')
export const electronChatButtonStateChanged = defineEventa<ChatButtonState>('eventa:event:electron:windows:chat:button-state-changed')

/**
 * Reads the saved placement, message feed, and pin, with the mode of the chat that asks. That mode is the saved mode,
 * except in a fullscreen chat that the fullscreen island opened while another mode is saved.
 */
export const electronChatWindowGetPreferences = defineInvokeEventa<ChatWindowPreferences>('eventa:invoke:electron:windows:chat:get-preferences')
/**
 * Persists the preferences that the request names, and keeps the others. A
 * mode that differs from the mode of the chat that asks moves the chat to the
 * window of that mode. The move carries the unsent draft over, and it rejects
 * without closing the chat that asked when the draft cannot be carried.
 */
export const electronChatWindowSetPreferences = defineInvokeEventa<void, Partial<ChatWindowPreferences>>('eventa:invoke:electron:windows:chat:set-preferences')
/**
 * Asks the chat window that a mode switch is about to close for its unsent
 * draft. The main process invokes it and the chat renderer answers, after any
 * image it is still reading has entered the draft.
 */
export const electronChatWindowCollectDraft = defineInvokeEventa<ChatDraftHandover | undefined>('eventa:invoke:electron:windows:chat:collect-draft')
/**
 * Returns the draft that a mode switch carries into the calling chat window.
 * A chat renderer calls it once it has mounted, and `undefined` means there
 * is nothing to put back.
 */
export const electronChatWindowTakeDraft = defineInvokeEventa<ChatDraftHandover | undefined>('eventa:invoke:electron:windows:chat:take-draft')
/**
 * Tells a chat window that is already open that a mode switch carries a draft to it. The page takes the draft again,
 * as it did when it mounted.
 */
export const electronChatWindowDraftOffered = defineEventa('eventa:event:electron:windows:chat:draft-offered')
/**
 * Reports what happened to the taken draft. The mode switch closes the
 * previous window only after `restored: true`; with `false` it closes the new
 * window instead, and the draft stays where it was. A window with no draft to
 * take reports `true`, which also tells the switch the page has mounted.
 */
export const electronChatWindowDraftSettled = defineInvokeEventa<void, { restored: boolean }>('eventa:invoke:electron:windows:chat:draft-settled')
export const electronChatFloatingGetState = defineInvokeEventa<ChatFloatingState>('eventa:invoke:electron:windows:chat-floating:get-state')
export const electronChatFloatingStateChanged = defineEventa<ChatFloatingState>('eventa:event:electron:windows:chat-floating:state-changed')
/** The renderer finished hiding the chat content for a fold or a relocation. */
export const electronChatFloatingContentHidden = defineInvokeEventa<void>('eventa:invoke:electron:windows:chat-floating:content-hidden')
/**
 * Resizes the floating chat window from one of its {@link ChatFloatingState.resizeEdges}, by the cursor movement in
 * screen pixels. The edges across from it stay in place.
 */
export const electronChatFloatingResizeBy = defineInvokeEventa<void, { deltaX: number, deltaY: number, direction: ResizeDirection }>('eventa:invoke:electron:windows:chat-floating:resize-by')
/**
 * Moves a `free` floating chat to where its drag handle puts it: the window
 * position in screen pixels, before any screen edge stops it. The main
 * process keeps the whole chat on the display that would hold most of it, so
 * a drag can carry the chat to another display. The handle does not use
 * `app-region: drag`: a native drag region on this click-through window stops
 * click-through from working.
 */
export const electronChatFloatingMoveTo = defineInvokeEventa<void, { x: number, y: number }>('eventa:invoke:electron:windows:chat-floating:move-to')
/**
 * Folds the floating chat from its own fold button, as the Controls Island
 * chat button does, so the button there shows the chat as closed.
 */
export const electronChatFloatingFold = defineInvokeEventa<void>('eventa:invoke:electron:windows:chat-floating:fold')
export const electronSpotlightHide = defineInvokeEventa<void>('eventa:invoke:electron:windows:spotlight:hide')
export const electronSpotlightShowResultNotification = defineInvokeEventa<void, { body: string }>('eventa:invoke:electron:windows:spotlight:show-result-notification')
export const electronSpotlightShortcutGet = defineInvokeEventa<ShortcutAccelerator>('eventa:invoke:electron:windows:spotlight:shortcut:get')
export const electronSpotlightShortcutSet = defineInvokeEventa<ShortcutRegistrationResult, { accelerator: ShortcutAccelerator | null }>('eventa:invoke:electron:windows:spotlight:shortcut:set')
export const electronOpenSettingsDevtools = defineInvokeEventa('eventa:invoke:electron:windows:settings:devtools:open')
export const electronOpenDevtoolsWindow = defineInvokeEventa<void, { key: string, route?: string, width?: number, height?: number, x?: number, y?: number }>('eventa:invoke:electron:windows:devtools:open')

export interface ElectronServerChannelConfig {
  tlsConfig?: ServerOptions['tlsConfig'] | null
  authToken: string
  hostname: string
}
export const electronGetServerChannelConfig = defineInvokeEventa<ElectronServerChannelConfig>('eventa:invoke:electron:server-channel:get-config')
export const electronApplyServerChannelConfig = defineInvokeEventa<ElectronServerChannelConfig, Partial<ElectronServerChannelConfig>>('eventa:invoke:electron:server-channel:apply-config')
export const electronGetServerChannelQrPayload = defineInvokeEventa<ServerChannelQrPayload>('eventa:invoke:electron:server-channel:get-qr-payload')

export type ElectronUpdaterChannel = UpdateChannel

/** Every updater preference. A set call sends all of them, and `channel` undefined means auto. */
export interface ElectronUpdaterPreferences {
  /** Whether a check downloads the update that it finds. Off, the renderer starts the download. */
  autoDownload: boolean
  channel?: ElectronUpdaterChannel
}

export const electronGetUpdaterPreferences = defineInvokeEventa<ElectronUpdaterPreferences>('eventa:invoke:electron:auto-updater:get-preferences')
export const electronSetUpdaterPreferences = defineInvokeEventa<ElectronUpdaterPreferences, ElectronUpdaterPreferences>('eventa:invoke:electron:auto-updater:set-preferences')

export * from './plugin/assets'
export * from './plugin/capabilities'
export * from './plugin/host'
export * from './plugin/tools'
export * from './window-backdrop'

export interface DesktopOverlayReadiness {
  state: 'booting' | 'ready' | 'degraded'
  error?: string
}

export const getDesktopOverlayReadinessContract = defineInvokeEventa<DesktopOverlayReadiness>('eventa:invoke:electron:windows:desktop-overlay:get-readiness')

export const captionIsFollowingWindowChanged = defineEventa<boolean>('eventa:event:electron:windows:caption-overlay:is-following-window-changed')
export const captionGetIsFollowingWindow = defineInvokeEventa<boolean>('eventa:invoke:electron:windows:caption-overlay:get-is-following-window')

export type RequestWindowActionDefault = 'confirm' | 'cancel' | 'close'
export interface RequestWindowPayload {
  id?: string
  route: string
  type?: string
  payload?: Record<string, any>
}
export interface RequestWindowPending {
  id: string
  type?: string
  payload?: Record<string, any>
}

export function createRequestWindowEventa(namespace: string) {
  const prefix = (name: string) => `eventa:${name}:electron:windows:${namespace}`
  return {
    openWindow: defineInvokeEventa<boolean, RequestWindowPayload>(prefix('invoke:open')),
    windowAction: defineInvokeEventa<void, { id: string, action: RequestWindowActionDefault }>(prefix('invoke:action')),
    pageMounted: defineInvokeEventa<RequestWindowPending | undefined, { id?: string }>(prefix('invoke:page-mounted')),
    pageUnmounted: defineInvokeEventa<void, { id?: string }>(prefix('invoke:page-unmounted')),
  }
}

// Notice window events built from generic factory
export const noticeWindowEventa = createRequestWindowEventa('notice')

// Widgets / Adhoc window events
export interface WidgetWindowSize {
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

export type WidgetGridSize = 's' | 'm' | 'l' | { cols?: number, rows?: number }

export interface WidgetsAddPayload {
  id?: string
  componentName: string
  componentProps?: Record<string, any>
  alwaysOnTop?: boolean
  // size presets or explicit spans; renderer decides mapping
  size?: WidgetGridSize
  windowSize?: WidgetWindowSize | Record<string, unknown>
  /** Automatic destruction delay in milliseconds. If omitted or zero, the widget stays until an explicit close. */
  ttlMs?: number
}

export interface WidgetsUpdatePayload {
  id: string
  componentProps?: Record<string, any>
  alwaysOnTop?: boolean
  size?: WidgetGridSize
  windowSize?: WidgetWindowSize | Record<string, unknown>
  /** Replaces the automatic destruction delay. If omitted, the current expiry time does not change. */
  ttlMs?: number
}

export interface WidgetSnapshot {
  id: string
  componentName: string
  componentProps: Record<string, any>
  alwaysOnTop: boolean
  size: WidgetGridSize
  windowSize?: WidgetWindowSize
  ttlMs: number
}

/**
 * Request relayed from Electron main to one mounted widget iframe through the widgets renderer.
 */
export interface WidgetsIframeRequestPayload {
  /** Widget id that identifies the mounted iframe target. */
  id: string
  /** Relay correlation id echoed by the renderer-to-main result event. */
  requestId: string
  /** Structured-clone-safe request record forwarded into the iframe Eventa runtime. */
  payload: GameletIframeInvokePayload['payload']
  /** Request timeout budget in milliseconds. */
  timeoutMs: number
}

/**
 * Shared fields for a renderer-to-main iframe request result.
 */
export interface WidgetsIframeRequestResultBasePayload {
  /** Widget id that produced the result. */
  id: string
  /** Relay correlation id matching the original main-to-renderer request. */
  requestId: string
}

/**
 * Successful renderer-to-main iframe request result.
 */
export interface WidgetsIframeRequestSuccessPayload extends WidgetsIframeRequestResultBasePayload {
  /** Marks this result as a successful iframe response. */
  ok: true
  /** Structured-clone-safe response record returned by the iframe Eventa runtime. */
  result: GameletIframeResponsePayload
}

/**
 * Failed renderer-to-main iframe request result.
 */
export interface WidgetsIframeRequestFailurePayload extends WidgetsIframeRequestResultBasePayload {
  /** Marks this result as a failed iframe response. */
  ok: false
  /** Error message returned when the iframe request fails. */
  error: string
}

/**
 * Result relayed from the widgets renderer back to Electron main for one iframe request.
 */
export type WidgetsIframeRequestResultPayload
  = | WidgetsIframeRequestSuccessPayload
    | WidgetsIframeRequestFailurePayload

export interface ElectronMcpStdioServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  enabled?: boolean
}

/**
 * One remote MCP server that AIRI reaches over streamable HTTP.
 *
 * Use when:
 * - A server runs outside this machine and AIRI talks to it by URL
 *
 * Expects:
 * - `url` is an absolute `http` or `https` endpoint
 * - `headers` carries whatever the server expects, usually an `Authorization` entry
 */
export interface ElectronMcpHttpServerConfig {
  url: string
  headers?: Record<string, string>
  enabled?: boolean
}

/**
 * Configuration of one MCP server.
 *
 * The transport follows from the fields that are present: `command` starts a
 * child process over stdio, `url` reaches a remote server over streamable HTTP.
 */
export type ElectronMcpServerConfig = ElectronMcpStdioServerConfig | ElectronMcpHttpServerConfig

export interface ElectronMcpConfigFile {
  terminalEnabled?: boolean
  /** Host-owned overrides keyed by the qualified server::tool name. */
  toolExposure?: Record<string, import('@proj-airi/stage-ui/types/mcp').McpToolExposureMode>
  mcpServers: Record<string, ElectronMcpServerConfig>
}

export interface ElectronMcpApplyResult {
  path: string
  started: Array<{ name: string }>
  failed: Array<{ name: string, error: string }>
  skipped: Array<{ name: string, reason: string }>
}

/**
 * Runtime state of one MCP server, narrowed by the transport that carries it.
 *
 * A stdio server reports the process it spawned. An HTTP server reports the
 * endpoint it talks to and has no process to report.
 */
export type ElectronMcpServerRuntimeStatus
  = | {
    name: string
    state: 'running' | 'stopped' | 'error'
    transport: 'stdio'
    command: string
    args: string[]
    pid: number | null
    lastError?: string
  }
  | {
    name: string
    state: 'running' | 'stopped' | 'error'
    transport: 'http'
    url: string
    lastError?: string
  }

export interface ElectronMcpRuntimeStatus {
  path: string
  servers: ElectronMcpServerRuntimeStatus[]
  updatedAt: number
}

export type ElectronMcpToolDescriptor = import('@proj-airi/stage-ui/types/mcp').McpToolDescriptor

export interface ElectronMcpCallToolPayload {
  name: string
  arguments?: Record<string, unknown>
  requestId?: string
  attribution?: import('./computer-use').InvocationAttributionPayload
}

export interface ElectronMcpCallToolResult {
  content?: Array<Record<string, unknown>>
  structuredContent?: Record<string, unknown>
  toolResult?: unknown
  isError?: boolean
  dispatchOutcome?: McpDispatchOutcome
}

export interface ElectronMcpConfigText {
  path: string
  text: string
}

export interface ElectronMcpTestResult {
  ok: boolean
  error?: string
  tools?: string[]
  durationMs: number
}

export interface ElectronMcpTestPayload {
  name: string
  config: ElectronMcpServerConfig
}

export const electronMcpOpenConfigFile = defineInvokeEventa<{ path: string }>('eventa:invoke:electron:mcp:open-config-file')
export const electronMcpApplyAndRestart = defineInvokeEventa<ElectronMcpApplyResult>('eventa:invoke:electron:mcp:apply-and-restart')
export const electronMcpGetRuntimeStatus = defineInvokeEventa<ElectronMcpRuntimeStatus>('eventa:invoke:electron:mcp:get-runtime-status')
export const electronMcpListTools = defineInvokeEventa<ElectronMcpToolDescriptor[], { name?: string } | undefined>('eventa:invoke:electron:mcp:list-tools')
export const electronMcpCallTool = defineInvokeEventa<ElectronMcpCallToolResult, ElectronMcpCallToolPayload>('eventa:invoke:electron:mcp:call-tool')
export const electronMcpReadConfigText = defineInvokeEventa<ElectronMcpConfigText>('eventa:invoke:electron:mcp:read-config-text')
export const electronMcpWriteConfigText = defineInvokeEventa<ElectronMcpConfigText, { text: string }>('eventa:invoke:electron:mcp:write-config-text')
export const electronMcpTestServer = defineInvokeEventa<ElectronMcpTestResult, ElectronMcpTestPayload>('eventa:invoke:electron:mcp:test-server')

export const widgetsOpenWindow = defineInvokeEventa<void, { id?: string }>('eventa:invoke:electron:windows:widgets:open')
export const widgetsHideWindow = defineInvokeEventa<void, { id?: string }>('eventa:invoke:electron:windows:widgets:hide')
export const widgetsAdd = defineInvokeEventa<string | undefined, WidgetsAddPayload>('eventa:invoke:electron:windows:widgets:add')
export const widgetsRemove = defineInvokeEventa<void, { id: string }>('eventa:invoke:electron:windows:widgets:remove')
export const widgetsClear = defineInvokeEventa('eventa:invoke:electron:windows:widgets:clear')
export const widgetsUpdate = defineInvokeEventa<void, WidgetsUpdatePayload>('eventa:invoke:electron:windows:widgets:update')
export const widgetsFetch = defineInvokeEventa<WidgetSnapshot | void, { id: string }>('eventa:invoke:electron:windows:widgets:fetch')
export const widgetsPrepareWindow = defineInvokeEventa<string | undefined, { id?: string }>('eventa:invoke:electron:windows:widgets:prepare')
export const widgetsIframePublish = defineInvokeEventa<void, { id: string, event: Record<string, unknown> }>('eventa:invoke:electron:windows:widgets:iframe-publish')

export const electronWindowClose = defineInvokeEventa<void>('eventa:invoke:electron:window:close')
export const electronWindowMinimize = defineInvokeEventa<void>('eventa:invoke:electron:window:minimize')
export const electronWindowToggleMaximize = defineInvokeEventa<void>('eventa:invoke:electron:window:toggle-maximize')

/**
 * What the self-drawn title bar shows for its window. The main process owns these values.
 */
export interface ElectronWindowControlsState {
  /** The system draws the window buttons, so the title bar draws none and leaves room for them. Only true on macOS. */
  systemControls: boolean
  /** On macOS, the traffic lights hide in fullscreen, so the title bar stops leaving room for them. */
  fullscreen: boolean
  /** Selects the restore or the maximize button. */
  maximized: boolean
  /** Hides the minimize button when false. Linux always reports true. */
  minimizable: boolean
  /** Hides the maximize button when false. Linux always reports true. */
  maximizable: boolean
  /** Hides the close button when false. */
  closable: boolean
}

export const electronGetWindowControlsState = defineInvokeEventa<ElectronWindowControlsState>('eventa:invoke:electron:window:get-controls-state')
/**
 * Centers the macOS traffic lights on a title bar that is not 44px high, for example the tab bar of a workbench.
 * Without `centerY`, the traffic lights go back to the position that the window was created with.
 * Other platforms ignore it.
 */
export const electronWindowCenterSystemControls = defineInvokeEventa<void, { centerY?: number }>('eventa:invoke:electron:window:center-system-controls')
export const electronWindowControlsStateChanged = defineEventa<ElectronWindowControlsState>('eventa:event:electron:window:controls-state-changed')

export type ElectronWindowLifecycleReason
  = | 'initial'
    | 'snapshot'
    | 'show'
    | 'hide'
    | 'minimize'
    | 'restore'
    | 'focus'
    | 'blur'

export interface ElectronWindowLifecycleState {
  focused: boolean
  minimized: boolean
  reason: ElectronWindowLifecycleReason
  updatedAt: number
  visible: boolean
}

export const electronWindowLifecycleChanged = defineEventa<ElectronWindowLifecycleState>('eventa:event:electron:window:lifecycle-changed')
export const electronGetWindowLifecycleState = defineInvokeEventa<ElectronWindowLifecycleState>('eventa:invoke:electron:window:get-lifecycle-state')
export const electronWindowSetAlwaysOnTop = defineInvokeEventa<void, boolean>('eventa:invoke:electron:window:set-always-on-top')
export const electronAppOpenUserDataFolder = defineInvokeEventa<{ path: string }>('eventa:invoke:electron:app:open-user-data-folder')
export const electronAppQuit = defineInvokeEventa<void>('eventa:invoke:electron:app:quit')
/**
 * The version of the installed app, from `app.getVersion()` in the main process.
 *
 * Packaging can set a version that the renderer bundle does not know, for example
 * `electron-builder -c.extraMetadata.version`. Screens that show the app version use this value.
 */
export const electronAppGetVersion = defineInvokeEventa<string>('eventa:invoke:electron:app:get-version')
/** Whether the app runs on the Wayland Ozone backend, where Electron cannot read the cursor position reliably. */
export const electronAppIsWayland = defineInvokeEventa<boolean>('eventa:invoke:electron:app:is-wayland')
/**
 * The main window mounted its page. The update launcher keeps a new bundle only when it reports healthy, so the page
 * calls it once it mounts, also after a page-only update reloaded it.
 */
export const electronMainPageMounted = defineInvokeEventa<void>('eventa:invoke:electron:main-window:page-mounted')
export const electronAppIconGet = defineInvokeEventa<boolean>('eventa:invoke:electron:app-icon:get')
export const electronAppIconSet = defineInvokeEventa<boolean, boolean>('eventa:invoke:electron:app-icon:set')
/**
 * The renderer sends the analytics switch to main. Main saves it and applies it to error reports from main, from the
 * renderers, and from native crashes, also on the next start before a renderer loads.
 */
export const electronErrorReportingSet = defineInvokeEventa<void, boolean>('eventa:invoke:electron:error-reporting:set')

export type ElectronGodotStageState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

/**
 * Snapshot of the Godot sidecar lifecycle owned by Electron main.
 *
 * Use when:
 * - Renderer windows need to reflect whether the external Godot window is available
 * - Settings or stage pages need lifecycle feedback after start/stop actions
 *
 * Expects:
 * - `pid` is only set while the Godot child process exists
 * - `lastError` is present for the most recent lifecycle or scene-apply failure
 *
 * Returns:
 * - N/A
 */
export interface ElectronGodotStageStatus {
  state: ElectronGodotStageState
  pid: number | null
  lastError?: string
  updatedAt: number
}

/**
 * Serialized scene input payload forwarded from renderer to Electron main.
 *
 * Use when:
 * - The selected model should be materialized to disk and applied to the Godot scene
 *
 * Expects:
 * - `data` contains the full model file bytes
 * - `fileName` matches the original model asset name when available
 *
 * Returns:
 * - N/A
 */
export interface ElectronGodotStageSceneInputPayload {
  modelId: string
  format: 'vrm'
  name: string
  fileName: string
  data: Uint8Array
}

export const electronGodotStageStart = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:start')
export const electronGodotStageStop = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:stop')
export const electronGodotStageGetStatus = defineInvokeEventa<ElectronGodotStageStatus>('eventa:invoke:electron:godot-stage:get-status')
export const electronGodotStageApplySceneInput = defineInvokeEventa<void, ElectronGodotStageSceneInputPayload>('eventa:invoke:electron:godot-stage:apply-scene-input')
export const electronGodotStageGetViewSnapshot = defineInvokeEventa<StageViewSnapshotPayload | null>('eventa:invoke:electron:godot-stage:view-snapshot:get')
export const electronGodotStageApplyViewPatch = defineInvokeEventa<StageViewRequestAckPayload, StageViewPatch>('eventa:invoke:electron:godot-stage:view-state:apply-patch')
export const electronGodotStageRequestViewSnapshot = defineInvokeEventa<StageViewRequestAckPayload>('eventa:invoke:electron:godot-stage:view-state:request-snapshot')
export const electronGodotStageStatusChanged = defineEventa<ElectronGodotStageStatus>('eventa:event:electron:godot-stage:status-changed')
export const electronGodotStageViewSnapshotChanged = defineEventa<StageViewSnapshotPayload>('eventa:event:electron:godot-stage:view-snapshot-changed')
export const electronGodotStageViewStateError = defineEventa<StageViewErrorPayload>('eventa:event:electron:godot-stage:view-state-error')

// Global shortcut ->

/**
 * Phase of a shortcut trigger event.
 *
 * - `down` — key combination pressed
 * - `up`   — key combination released; only emitted by drivers that
 *            accepted a binding with `receiveKeyUps: true`
 */
export type ElectronShortcutTriggerPhase = 'down' | 'up'

/**
 * Payload broadcast to all subscribed windows when a registered shortcut
 * fires. Renderer composables filter by `id` to dispatch local handlers.
 */
export interface ElectronShortcutTriggerPayload {
  id: string
  phase: ElectronShortcutTriggerPhase
}

export const electronShortcutRegister = defineInvokeEventa<ShortcutRegistrationResult, ShortcutBinding>('eventa:invoke:electron:shortcut:register')
export const electronShortcutUnregister = defineInvokeEventa<void, { id: string }>('eventa:invoke:electron:shortcut:unregister')
export const electronShortcutUnregisterAll = defineInvokeEventa<void>('eventa:invoke:electron:shortcut:unregister-all')
export const electronShortcutList = defineInvokeEventa<ShortcutBinding[]>('eventa:invoke:electron:shortcut:list')
export const electronShortcutTriggered = defineEventa<ElectronShortcutTriggerPayload>('eventa:event:electron:shortcut:triggered')

// <- Global shortcut

export type StageThreeRuntimeTraceEnvelope
  = | { type: 'three-render-info', payload: ThreeSceneRenderInfoTracePayload }
    | { type: 'three-hit-test-read', payload: ThreeHitTestReadTracePayload }
    | { type: 'vrm-update-frame', payload: VrmUpdateFrameTracePayload }
    | { type: 'vrm-load-start', payload: VrmLoadStartTracePayload }
    | { type: 'vrm-load-end', payload: VrmLoadEndTracePayload }
    | { type: 'vrm-load-error', payload: VrmLoadErrorTracePayload }
    | { type: 'vrm-dispose-start', payload: VrmDisposeStartTracePayload }
    | { type: 'vrm-dispose-end', payload: VrmDisposeEndTracePayload }

export interface StageThreeRuntimeTraceForwardedPayload {
  envelope: StageThreeRuntimeTraceEnvelope
  origin: string
}

export interface StageThreeRuntimeTraceRemoteControlPayload {
  origin: string
}

export const stageThreeRuntimeTraceForwardedEvent = defineEventa<StageThreeRuntimeTraceForwardedPayload>('eventa:event:stage-three-runtime-trace:forwarded')
export const stageThreeRuntimeTraceRemoteEnableEvent = defineEventa<StageThreeRuntimeTraceRemoteControlPayload>('eventa:event:stage-three-runtime-trace:remote-enable')
export const stageThreeRuntimeTraceRemoteDisableEvent = defineEventa<StageThreeRuntimeTraceRemoteControlPayload>('eventa:event:stage-three-runtime-trace:remote-disable')

// Internal event from main -> widgets renderer when a widget should render
export const widgetsRenderEvent = defineEventa<WidgetSnapshot>('eventa:event:electron:windows:widgets:render')
export const widgetsRemoveEvent = defineEventa<{ id: string }>('eventa:event:electron:windows:widgets:remove')
export const widgetsClearEvent = defineEventa('eventa:event:electron:windows:widgets:clear')
export const widgetsUpdateEvent = defineEventa<WidgetsUpdatePayload>('eventa:event:electron:windows:widgets:update')
/** Main-to-renderer event requesting work from a mounted widget iframe. */
export const widgetsIframeRequestEvent = defineEventa<WidgetsIframeRequestPayload>('eventa:event:electron:windows:widgets:iframe-request')
/** Renderer-to-main event carrying the correlated result for a widget iframe request. */
export const widgetsIframeRequestResultEvent = defineEventa<WidgetsIframeRequestResultPayload>('eventa:event:electron:windows:widgets:iframe-request-result')

// Onboarding window events
export const electronOnboardingClose = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:close')
export const electronOpenOnboarding = defineInvokeEventa('eventa:invoke:electron:windows:onboarding:open')

// Auth — OIDC Authorization Code + PKCE flow via system browser
export interface ElectronAuthTokens {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
}
export const electronAuthStartLogin = defineInvokeEventa<void>('eventa:invoke:electron:auth:start-login')
/** Transient sign-in feedback shared with all windows; contains no credentials. */
export interface ElectronAuthStatus {
  attemptId: string
  state: 'waiting' | 'confirming' | 'success' | 'error'
  error?: string
}
export const electronAuthStatus = defineEventa<ElectronAuthStatus>('eventa:event:electron:auth:status')
export const electronAuthGetStatus = defineInvokeEventa<ElectronAuthStatus | undefined>('eventa:invoke:electron:auth:get-status')
export const electronAuthComplete = defineInvokeEventa<void, Pick<ElectronAuthStatus, 'attemptId' | 'error'>>('eventa:invoke:electron:auth:complete')
export const electronAuthCallback = defineEventa<ElectronAuthTokens & { attemptId: string }>('eventa:event:electron:auth:callback')
export const electronAuthCallbackError = defineEventa<{ error: string }>('eventa:event:electron:auth:callback-error')
export const electronAuthLogout = defineInvokeEventa<void>('eventa:invoke:electron:auth:logout')

export const i18nSetLocale = defineInvokeEventa<void, Locale>('eventa:invoke:electron:i18n:set-locale')
export const i18nGetLocale = defineInvokeEventa<string | undefined>('eventa:invoke:electron:i18n:get-locale')

export { electron } from '@proj-airi/electron-eventa'
export * from '@proj-airi/electron-eventa/electron-updater'
