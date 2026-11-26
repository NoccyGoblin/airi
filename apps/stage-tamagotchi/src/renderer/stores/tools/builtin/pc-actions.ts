import type { Conversation } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'

import type { PcActionRequest, PcCapture } from '../../../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { useTextGeneration } from '@proj-airi/stage-ui/composables/text-generation'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronPcAction, electronPcCapture } from '../../../../shared/eventa'
import { describingConversation, parsePointingAnswer, pointingConversation } from './pointing'

/**
 * FAIRY: fast actions on the owner's PC: open a website or an app, press a shortcut in the app in front, and media
 * keys. The main process does the work (see `src/main/services/fairy/pc-actions`).
 */

export const OPEN_WEBSITE_TOOL_NAME = 'open_website'
export const OPEN_APP_TOOL_NAME = 'open_app'
export const CLOSE_APP_TOOL_NAME = 'close_app'
export const TYPE_TEXT_TOOL_NAME = 'type_text'
export const DISCORD_MESSAGE_TOOL_NAME = 'discord_message'
export const READ_APP_TOOL_NAME = 'read_app'
export const CLICK_ELEMENT_TOOL_NAME = 'click_element'
export const CLICK_ON_TOOL_NAME = 'click_on'
export const DESCRIBE_SCREEN_TOOL_NAME = 'describe_screen'
export const SCROLL_TOOL_NAME = 'scroll'
export const PRESS_KEYS_TOOL_NAME = 'press_keys'
export const MEDIA_CONTROL_TOOL_NAME = 'media_control'

const ONLY_WHEN_ASKED = 'Use it only when the owner asks you to do something on their PC, never on your own.'

let invokers: { act: (request: PcActionRequest) => Promise<{ ok: boolean, message: string }>, capture: () => Promise<PcCapture> } | undefined
function getInvokers() {
  if (!invokers) {
    const { context } = createContext(window.electron.ipcRenderer)
    invokers = { act: defineInvoke(context, electronPcAction), capture: defineInvoke(context, electronPcCapture) }
  }
  return invokers
}
function act(request: PcActionRequest) {
  return getInvokers().act(request).then(result => JSON.stringify(result))
}
function getCapture() {
  return getInvokers().capture()
}

/**
 * Takes a screenshot of the screen under the mouse and asks the vision model where `target` is. Nothing is clicked.
 *
 * Returns:
 * - The screenshot id and size, and the answer with the center of the target in screenshot pixels
 */
export async function locateOnScreen(target: string) {
  const shot = await getCapture()
  const answer = parsePointingAnswer(await askVision(pointingConversation(target, { url: `data:${shot.mimeType};base64,${shot.data}`, width: shot.width, height: shot.height })))
  return { shot: { captureId: shot.captureId, width: shot.width, height: shot.height }, answer }
}

/** Sends one screenshot request to the chat model of the character, which reads images. */
async function askVision(conversation: Conversation) {
  const consciousness = useConsciousnessStore()
  if (!consciousness.activeProvider || !consciousness.activeModel)
    throw new Error('No chat model is set, so the screen cannot be read.')
  const generate = useTextGeneration().generateText({ providerId: consciousness.activeProvider, model: consciousness.activeModel, maxTokens: 300 })
  return await generate(conversation, AbortSignal.timeout(30_000))
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
    name: DISCORD_MESSAGE_TOOL_NAME,
    description: [
      'Send a Discord direct message to one person for the owner. It opens Discord, finds the person, checks that their direct message is open, and sends.',
      'It never sends to a group chat or a server, and it stops when it cannot open the right direct message.',
      'Write the message in the owner\'s voice, not as yourself, unless they ask otherwise. Call it once, and do not use other tools for the same message.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { person: string, message: string }) => act({ kind: 'discord-message', person: input.person, message: input.message }),
    parameters: z.object({
      person: z.string().describe('The person\'s Discord name as the owner said it, without "@", for example "boterlion".'),
      message: z.string().max(2000).describe('The message to send.'),
    }),
  }),
  tool({
    name: TYPE_TEXT_TOOL_NAME,
    description: [
      'Type text into the app in front on the owner\'s PC, where its text cursor is, for example a search box or a chat box.',
      'It only types and never sends. Press enter with press_keys to send or confirm.',
      'To message one person on Discord, use discord_message instead.',
      'Send to a group chat or a server channel only when the owner said to send it to that group.',
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
      'To send a Discord direct message, use discord_message, not keys.',
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
    name: READ_APP_TOOL_NAME,
    description: [
      'Read the buttons, links, fields, tabs, and texts of an open app window on the owner\'s PC, as a numbered list, straight from Windows. It is fast and exact, and it takes no screenshot.',
      'Use it first to find what to click in an app, then click_element with a number. Read again after each click, because the numbers change.',
      'Games, videos, and pictures show no parts here. Use click_on and describe_screen for them.',
    ].join(' '),
    execute: async (input: { app: string }) => act({ kind: 'read-window', app: input.app || undefined }),
    parameters: z.object({ app: z.string().describe('The app, for example "Discord" or "Spotify". Windows can name built-in apps in its own language. An empty text reads the app in front, for example right after open_app.') }),
  }),
  tool({
    name: CLICK_ELEMENT_TOOL_NAME,
    description: [
      'Click a numbered part from the last read_app, for example a button or a link. It brings the app to the front and clicks the exact middle of the part.',
      'Before a click that sends, buys, deletes, or posts something, tell the owner what you will click and wait for a yes.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { id: number, button: 'left' | 'right', double_click: boolean }) =>
      act({ kind: 'click-element', id: input.id, button: input.button, double: input.double_click }),
    parameters: z.object({
      id: z.number().int().describe('The part number from the last read_app.'),
      button: z.enum(['left', 'right']).describe('The mouse button. Use "left" unless the owner asked for a right-click.'),
      double_click: z.boolean().describe('True to double-click, for example to open a file.'),
    }),
  }),
  tool({
    name: CLICK_ON_TOOL_NAME,
    description: [
      'Click on something on the owner\'s screen by describing it, for example "the blue Play button", "the second video in the list", or "the Settings gear in the top right".',
      'It takes a fresh screenshot of the screen under the mouse, finds the thing, and clicks its center. Describe it the way it looks on screen.',
      'In apps, try read_app and click_element first, because they are faster and exact. Use click_on for games, videos, pictures, and parts that read_app does not list.',
      'After a click that should change the screen, use describe_screen to check the result before the next step.',
      'Before a click that sends, buys, deletes, or posts something, tell the owner what you will click and wait for a yes.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { target: string, button: 'left' | 'right', double_click: boolean }) => {
      const { shot, answer } = await locateOnScreen(input.target)
      if (!answer.found)
        return JSON.stringify({ ok: false, message: `Did not click: ${answer.reason ?? 'not found'}.` })
      const result = JSON.parse(await act({ kind: 'click', captureId: shot.captureId, x: Math.round(answer.x!), y: Math.round(answer.y!), button: input.button, double: input.double_click })) as { ok: boolean, message: string }
      return JSON.stringify(result.ok ? { ok: true, message: `${result.message} It was ${answer.what ?? input.target}.` } : result)
    },
    parameters: z.object({
      target: z.string().describe('What to click, described as it looks on screen.'),
      button: z.enum(['left', 'right']).describe('The mouse button. Use "left" unless the owner asked for a right-click.'),
      double_click: z.boolean().describe('True to double-click, for example to open a file on the desktop.'),
    }),
  }),
  tool({
    name: DESCRIBE_SCREEN_TOOL_NAME,
    description: [
      'Look at the owner\'s screen now and answer a question about it in words, for example "did the video start?" or "which buttons are in the dialog?".',
      'Use it to check what a click or a key did, and to find what to click next.',
    ].join(' '),
    execute: async (input: { question: string }) => {
      const shot = await getCapture()
      return await askVision(describingConversation(input.question, `data:${shot.mimeType};base64,${shot.data}`))
    },
    parameters: z.object({ question: z.string().describe('What you want to know about the screen.') }),
  }),
  tool({
    name: SCROLL_TOOL_NAME,
    description: [
      'Scroll with the mouse wheel where the mouse pointer is on the owner\'s screen, for example to see more of a page or a list.',
      'One notch is a few lines. Use describe_screen afterwards to see the new part.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { direction: 'up' | 'down', notches: number }) => act({ kind: 'scroll', direction: input.direction, notches: input.notches }),
    parameters: z.object({
      direction: z.enum(['up', 'down']),
      notches: z.number().int().min(1).max(20).describe('How far, in wheel notches. 5 is about half a page.'),
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
