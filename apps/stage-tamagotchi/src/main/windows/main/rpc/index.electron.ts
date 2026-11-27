import type { BrowserWindow, Rectangle } from 'electron'

import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { GodotStageManager } from '../../../services/airi/godot-stage'
import type { IOTraceRecordingService } from '../../../services/airi/io-trace-recording'
import type { McpManager } from '../../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../../services/electron/auto-updater'
import type { GlobalShortcutService } from '../../../services/electron/global-shortcut'
import type { ChatWindowManager } from '../../chat'
import type { ControlsMenuWindowManager } from '../../controls-menu'
import type { EditorWindowManager } from '../../editor'
import type { NoticeWindowManager } from '../../notice'
import type { OnboardingWindowManager } from '../../onboarding'
import type { SettingsWindowManager } from '../../settings'
import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { onWindowClosed } from '@proj-airi/electron-vueuse/main'
import { ipcMain } from 'electron'

import {
  electronCenterMainWindow,
  electronChatButtonStateChanged,
  electronControlsMenuOpen,
  electronGetChatButtonState,
  electronMainPageMounted,
  electronMainWindowRefreshUnread,
  electronOpenChat,
  electronOpenEditor,
  electronOpenInlay,
  electronOpenMainDevtools,
  electronOpenSettings,
  noticeWindowEventa,
} from '../../../../shared/eventa'
import { createWindowContext } from '../../../libs/electron/window-context'
import { createAuthService } from '../../../services/airi/auth'
import { createGodotStageService } from '../../../services/airi/godot-stage'
import { registerIOTraceRecording } from '../../../services/airi/io-trace-recording/register'
import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { createOnboardingService } from '../../../services/airi/onboarding'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createAutoUpdaterService } from '../../../services/electron'
import { createActivityBubbleService } from '../../../services/fairy/activity-bubble'
import { createDesktopLifeService } from '../../../services/fairy/desktop-life'
import { createDiscordBotService } from '../../../services/fairy/discord'
import { createFileDropService } from '../../../services/fairy/file-drop'
import { createLiveModeService } from '../../../services/fairy/live-mode'
import { startLocalVoiceServer } from '../../../services/fairy/local-voice'
import { createMiniGamesService } from '../../../services/fairy/mini-games'
import { createMischiefService } from '../../../services/fairy/mischief'
import { createPhoneService } from '../../../services/fairy/phone'
import { createRoutineScheduler } from '../../../services/fairy/routines'
import { createStickyNotesService } from '../../../services/fairy/sticky-notes'
import { createStopKeyService } from '../../../services/fairy/stop-key'
import { createWanderService } from '../../../services/fairy/wander'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

export async function setupMainWindowElectronInvokes(params: {
  window: BrowserWindow
  /** The app menu of the controls island. It opens in its own window, so it can extend past this one. */
  controlsMenu: ControlsMenuWindowManager
  editorWindow: EditorWindowManager
  settingsWindow: SettingsWindowManager
  chatWindow: ChatWindowManager
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpManager: McpManager
  i18n: I18n
  onboardingWindowManager: OnboardingWindowManager
  ioTraceRecording: IOTraceRecordingService
  inlayWindow: () => Promise<BrowserWindow>
  globalShortcut: GlobalShortcutService
  /** Owns the main window's pin, which fullscreen mode overrides. */
  setPinned: (pinned: boolean) => void
  /** Centers the main window on its display, and returns its new bounds. Fullscreen mode centers the bounds it returns to. */
  center: () => Rectangle
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createWindowContext(params.window)

  await setupBaseWindowElectronInvokes({ context, window: params.window, serverChannel: params.serverChannel, i18n: params.i18n, setAlwaysOnTop: params.setPinned })
  // The stage renderer owns the voice host, so it registers the Push to Talk hold shortcut and receives its key events.
  params.globalShortcut.registerWindow({ context, window: params.window })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.window })
  createAutoUpdaterService({ context, window: params.window, service: params.autoUpdater })
  defineInvokeHandler(context, electronMainPageMounted, () => params.autoUpdater.markMainPageMounted())
  createMcpServersService({ context, manager: params.mcpManager })
  createGodotStageService({ context, manager: params.godotStageManager, window: params.window })
  createOnboardingService({ context, onboardingWindowManager: params.onboardingWindowManager, mainWindow: params.window })
  createAuthService({ context, window: params.window })
  // FAIRY: the main window answers messages from the phone page.
  createPhoneService({ context })
  // FAIRY: the character's local voice (Kokoro speech and Whisper hearing).
  void startLocalVoiceServer()
  // FAIRY: only the main window runs live mode.
  onWindowClosed(params.window, createLiveModeService({ context, window: params.window }))
  // FAIRY: only the main window runs routines.
  onWindowClosed(params.window, createRoutineScheduler({ context }))
  // FAIRY: Escape stops the character while she is busy.
  onWindowClosed(params.window, createStopKeyService({ context }))
  // FAIRY: the character's own Discord bot. It starts when fairy-data/discord-bot.json has a token.
  onWindowClosed(params.window, createDiscordBotService({ context }))
  // FAIRY: wander mode floats the character's window around the screen.
  onWindowClosed(params.window, createWanderService({ context, window: params.window }))
  // FAIRY: reads files that the owner drops on the character.
  createFileDropService({ context })
  // FAIRY: a bubble next to the character that says what she does.
  onWindowClosed(params.window, createActivityBubbleService({ context, window: params.window }))
  // FAIRY: throws, naps, and other bits of life on the desktop.
  onWindowClosed(params.window, createDesktopLifeService({ context, window: params.window }))
  // FAIRY: sticky notes that she puts on the screen.
  onWindowClosed(params.window, createStickyNotesService({ context }))
  // FAIRY: mini games with her.
  onWindowClosed(params.window, createMiniGamesService({ context }))
  // FAIRY: mischief mode, small pranks when the owner turns it on.
  onWindowClosed(params.window, createMischiefService({ context, window: params.window }))
  const stopIOTraceRecording = registerIOTraceRecording(context, params.ioTraceRecording)
  onWindowClosed(params.window, stopIOTraceRecording)

  defineInvokeHandler(context, electronCenterMainWindow, () => params.center())
  defineInvokeHandler(context, electronOpenMainDevtools, () => params.window.webContents.openDevTools({ mode: 'detach' }))
  defineInvokeHandler(context, electronOpenEditor, () => params.editorWindow.openWindow())
  // Speech opens the inlay without focus, so the user can keep working in another app while speaking.
  defineInvokeHandler(context, electronOpenInlay, async () => {
    const inlay = await params.inlayWindow()
    if (!inlay.isDestroyed() && !inlay.isVisible())
      inlay.showInactive()
  })
  defineInvokeHandler(context, electronOpenSettings, payload => params.settingsWindow.openWindow(payload?.route))
  defineInvokeHandler(context, electronOpenChat, () => params.chatWindow.toggle())
  defineInvokeHandler(context, electronGetChatButtonState, () => params.chatWindow.getButtonState())
  const stopChatButtonState = params.chatWindow.onButtonStateChange(state => context.emit(electronChatButtonStateChanged, state))
  onWindowClosed(params.window, stopChatButtonState)
  defineInvokeHandler(context, noticeWindowEventa.openWindow, payload => params.noticeWindow.open(payload))
  defineInvokeHandler(context, electronControlsMenuOpen, request => params.controlsMenu.open(request))
  const stopControlsMenuRead = params.controlsMenu.onNotificationsRead(() => context.emit(electronMainWindowRefreshUnread, undefined))
  onWindowClosed(params.window, stopControlsMenuRead)
}
