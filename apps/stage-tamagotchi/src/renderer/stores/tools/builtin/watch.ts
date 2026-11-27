import type { Tool } from '@xsai/shared-chat'

import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { askAboutScreen, readScreenText } from './pc-actions'

/**
 * FAIRY: "tell me when…". The character watches the screen for the owner and speaks up when the thing happens.
 *
 * - `text`: the free OCR of Windows reads the screen every few seconds, and a word that appears or goes away counts.
 * - `look`: the vision model answers a yes or no question about a screenshot now and then. It costs tokens on each
 *   look, so it runs slower and stops by itself.
 *
 * Watches live in this window only and end with a restart.
 */

export const WATCH_FOR_TOOL_NAME = 'watch_for'
export const LIST_WATCHES_TOOL_NAME = 'list_watches'
export const STOP_WATCHING_TOOL_NAME = 'stop_watching'

const TEXT_EVERY_MS = 4_000
const LOOK_EVERY_MS = 45_000
const DEFAULT_MINUTES = { text: 60, look: 20 } as const
const MAX_MINUTES = { text: 240, look: 60 } as const
const MAX_WATCHES = 3
/** A notice may use the toolbox, so she can act on what happened when the owner asked for that. */
const NOTICE_TOOLS = [{ name: 'open_toolbox' }]

interface Watch {
  id: number
  what: string
  kind: 'text' | 'look'
  text?: string
  gone?: boolean
  question?: string
  until: number
  timer: ReturnType<typeof setInterval>
  busy: boolean
}

const watches = new Map<number, Watch>()
let nextId = 1

/** Lower case words only, so OCR spacing and punctuation do not matter. */
export function plainText(text: string) {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Whether the screen text now meets a text watch: the words are there, or are gone. */
export function textMatches(screenText: string, wanted: string, gone = false) {
  const found = ` ${plainText(screenText)} `.includes(` ${plainText(wanted)} `)
  return gone ? !found : found
}

/** Whether a look answer says yes. The vision model starts with YES or NO. */
export function saysYes(answer: string) {
  return /^\W*yes\b/i.test(answer)
}

function notify(text: string) {
  const sessionId = useChatSessionStore().activeSessionId
  if (!sessionId)
    return
  void useChatStore().notifyConversation(sessionId, { source: 'watch', text }, { tools: NOTICE_TOOLS, waitForCompletion: false }).catch(error => console.warn('[watch] notice failed', errorMessageFrom(error)))
}

function stop(id: number) {
  const watch = watches.get(id)
  if (watch)
    clearInterval(watch.timer)
  watches.delete(id)
  return watch
}

async function check(watch: Watch) {
  if (watch.busy)
    return
  watch.busy = true
  try {
    if (Date.now() > watch.until) {
      stop(watch.id)
      notify(`[Watch: you stopped watching for "${watch.what}" because the time ran out. It did not happen. Tell the owner in a few words.]`)
      return
    }
    if (watch.kind === 'text') {
      if (!textMatches(await readScreenText(), watch.text ?? '', watch.gone))
        return
    }
    else {
      const answer = await askAboutScreen(`Answer with only YES or NO first, then at most ten words why. ${watch.question}`)
      if (!saysYes(answer))
        return
    }
    stop(watch.id)
    notify(`[Watch: you were watching for "${watch.what}" for the owner, and it happened just now. Tell the owner right away, in a few words.]`)
  }
  catch (error) {
    console.warn('[watch] check failed', errorMessageFrom(error))
  }
  finally {
    watch.busy = false
  }
}

function describe(watch: Watch) {
  const minutes = Math.max(0, Math.round((watch.until - Date.now()) / 60_000))
  return `[${watch.id}] ${watch.what} (${watch.kind === 'text' ? `text "${watch.text}" ${watch.gone ? 'goes away' : 'shows up'}` : 'looks at the screen'}, ${minutes} min left)`
}

const tools: Promise<Tool>[] = [
  tool({
    name: WATCH_FOR_TOOL_NAME,
    description: [
      'Watch the owner\'s screen for something and tell them when it happens, for example "tell me when the download is done".',
      'Use kind "text" when a word on the screen shows it, for example "Download complete" or "Match found": it is free and checks every few seconds. Set gone to true to wait until a text goes away.',
      'Use kind "look" only when no text shows it, for example a health bar that gets low: each look costs tokens, so it checks less often and stops sooner.',
      `At most ${MAX_WATCHES} watches at once. Tell the owner what you watch for.`,
    ].join(' '),
    execute: async (input: { what: string, kind: 'text' | 'look', text: string, gone: boolean, question: string, minutes: number }) => {
      if (watches.size >= MAX_WATCHES)
        return `Not started: you already watch ${MAX_WATCHES} things. Stop one first.`
      if (input.kind === 'text' && !plainText(input.text))
        return 'Not started: a text watch needs the text to look for.'
      if (input.kind === 'look' && !input.question.trim())
        return 'Not started: a look watch needs a yes or no question about the screen.'
      const minutes = Math.min(MAX_MINUTES[input.kind], Math.max(1, Math.round(input.minutes || DEFAULT_MINUTES[input.kind])))
      const id = nextId++
      const watch: Watch = {
        id,
        what: input.what.trim(),
        kind: input.kind,
        text: input.text.trim(),
        gone: input.gone,
        question: input.question.trim(),
        until: Date.now() + minutes * 60_000,
        timer: setInterval(() => void check(watches.get(id)!), input.kind === 'text' ? TEXT_EVERY_MS : LOOK_EVERY_MS),
        busy: false,
      }
      watches.set(id, watch)
      void check(watch)
      return `Watching now: ${describe(watch)}.`
    },
    parameters: z.object({
      what: z.string().describe('What the owner asked you to watch for, in a few words.'),
      kind: z.enum(['text', 'look']),
      text: z.string().describe('For kind "text": the word or words on the screen. Otherwise an empty text.'),
      gone: z.boolean().describe('For kind "text": true to wait until the text goes away, for example "Downloading".'),
      question: z.string().describe('For kind "look": a yes or no question about the screen, for example "Is the health bar below a quarter?". Otherwise an empty text.'),
      minutes: z.number().int().min(1).max(MAX_MINUTES.text).describe(`How long to watch at most. ${DEFAULT_MINUTES.text} for text and ${DEFAULT_MINUTES.look} for look are good defaults.`),
    }),
  }),
  tool({
    name: LIST_WATCHES_TOOL_NAME,
    description: 'List what you are watching the screen for right now.',
    execute: async () => watches.size ? [...watches.values()].map(describe).join('\n') : 'You are not watching for anything.',
    parameters: z.object({}),
  }),
  tool({
    name: STOP_WATCHING_TOOL_NAME,
    description: 'Stop a watch by its number, or every watch with 0, for example when the owner says to stop watching.',
    execute: async (input: { id: number }) => {
      if (input.id === 0) {
        const count = watches.size
        for (const id of [...watches.keys()])
          stop(id)
        return `Stopped ${count} watch${count === 1 ? '' : 'es'}.`
      }
      const watch = stop(input.id)
      return watch ? `Stopped watching for ${watch.what}.` : `There is no watch [${input.id}].`
    },
    parameters: z.object({ id: z.number().int().min(0).describe('The watch number, or 0 for all.') }),
  }),
]

export const watchTools = async () => Promise.all(tools)
