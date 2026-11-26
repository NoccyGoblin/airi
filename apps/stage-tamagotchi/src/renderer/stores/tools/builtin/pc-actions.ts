import type { Tool } from '@xsai/shared-chat'

import type { PcActionRequest } from '../../../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronPcAction } from '../../../../shared/eventa'

/**
 * FAIRY: fast actions on the owner's PC: open a website or an app, press a shortcut in the app in front, and media
 * keys. The main process does the work (see `src/main/services/fairy/pc-actions`).
 */

export const OPEN_WEBSITE_TOOL_NAME = 'open_website'
export const OPEN_APP_TOOL_NAME = 'open_app'
export const CLOSE_APP_TOOL_NAME = 'close_app'
export const TYPE_TEXT_TOOL_NAME = 'type_text'
export const PRESS_KEYS_TOOL_NAME = 'press_keys'
export const MEDIA_CONTROL_TOOL_NAME = 'media_control'

const ONLY_WHEN_ASKED = 'Use it only when the owner asks you to do something on their PC, never on your own.'

let invoke: ((request: PcActionRequest) => Promise<{ ok: boolean, message: string }>) | undefined
function act(request: PcActionRequest) {
  invoke ??= defineInvoke(createContext(window.electron.ipcRenderer).context, electronPcAction)
  return invoke(request).then(result => JSON.stringify(result))
}

const tools: Promise<Tool>[] = [
  tool({
    name: OPEN_WEBSITE_TOOL_NAME,
    description: [
      'Open a web address in a new browser tab on the owner\'s PC.',
      'For a search, build the address yourself, for example https://www.youtube.com/results?search_query=lofi or https://www.google.com/search?q=weather.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { url: string, browser: 'default' | 'chrome' | 'edge' | 'firefox' | 'brave' | 'opera' }) =>
      act({ kind: 'open-website', url: input.url, browser: input.browser }),
    parameters: z.object({
      url: z.string().describe('The web address, for example "youtube.com" or a full https address.'),
      browser: z.enum(['default', 'chrome', 'edge', 'firefox', 'brave', 'opera']).describe('The browser the owner named. Use "default" when they named none.'),
    }),
  }),
  tool({
    name: OPEN_APP_TOOL_NAME,
    description: [
      'Open an installed app on the owner\'s PC by its name, as in the Start menu, for example "Spotify", "Discord", or "Riot Client".',
      'The result says which app opened and lists other close matches.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { name: string }) => act({ kind: 'open-app', name: input.name }),
    parameters: z.object({ name: z.string().describe('The app name.') }),
  }),
  tool({
    name: CLOSE_APP_TOOL_NAME,
    description: [
      'Close an open app on the owner\'s PC, with all its windows, by its name or a word from its window title, for example "Discord" or "Spotify".',
      'It asks the app to close like its close button, so an app with unsaved work can still ask to save. It never forces an app closed.',
      'Windows itself, you (AIRI), and the Claude app cannot be closed. To close only one browser tab, use press_keys with ctrl+w instead.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { name: string }) => act({ kind: 'close-app', name: input.name }),
    parameters: z.object({ name: z.string().describe('The app name, or a word from its window title.') }),
  }),
  tool({
    name: TYPE_TEXT_TOOL_NAME,
    description: [
      'Type text into the app in front on the owner\'s PC, where its text cursor is, for example a search box or a chat box.',
      'It only types and never sends. Press enter with press_keys to send or confirm.',
      'To message one person on Discord: open_app "Discord", press_keys ctrl+k, type_text "@" followed by the person\'s name (the "@" shows only people, not groups that the person is in),',
      'press_keys enter, type_text the message, then press_keys enter to send.',
      'Send to a group chat or a server channel only when the owner said to send it to that group.',
      'Write the message in the owner\'s voice, not as yourself, unless they ask otherwise.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { text: string }) => act({ kind: 'type-text', text: input.text }),
    parameters: z.object({ text: z.string().max(2000).describe('The text to type.') }),
  }),
  tool({
    name: PRESS_KEYS_TOOL_NAME,
    description: [
      'Press one keyboard shortcut in the app that is in front on the owner\'s PC. It works in any app.',
      'Examples: new tab ctrl+t, close tab ctrl+w, reopen tab ctrl+shift+t, next tab ctrl+tab, reload f5, full screen f11,',
      'switch app alt+tab, show desktop win+d, find ctrl+f, undo ctrl+z. Call it again for a second shortcut.',
      'Alt+F4 and Shift+Delete are blocked.',
      'In Discord, enter in a group chat or server channel is blocked unless group_send_approved is true.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { keys: string, group_send_approved: boolean }) =>
      act({ kind: 'press-keys', keys: input.keys, groupSendApproved: input.group_send_approved }),
    parameters: z.object({
      keys: z.string().describe('One shortcut, keys joined with "+", for example "ctrl+shift+t".'),
      group_send_approved: z.boolean().describe('True only when the owner\'s own words said to send the message to this group or channel. Otherwise false.'),
    }),
  }),
  tool({
    name: MEDIA_CONTROL_TOOL_NAME,
    description: [
      'Press a media key on the owner\'s PC: play or pause the music or video, next or previous track, or change the volume.',
      'Each volume step is small, so call it a few times for a bigger change.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { action: 'play-pause' | 'next' | 'previous' | 'volume-up' | 'volume-down' | 'mute' }) =>
      act({ kind: 'media', action: input.action }),
    parameters: z.object({ action: z.enum(['play-pause', 'next', 'previous', 'volume-up', 'volume-down', 'mute']) }),
  }),
]

export const pcActionTools = async () => Promise.all(tools)
