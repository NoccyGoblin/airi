import type { createContext } from '@moeru/eventa/adapters/electron/renderer'
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { formatDistanceStrict } from 'date-fns'
import { nanoid } from 'nanoid'

import { electronLiveModeTick, electronLookAtScreen } from '../../shared/eventa'
import { useLiveModeStore } from '../stores/live-mode'

type RendererContext = ReturnType<typeof createContext>['context']

export const LIVE_MODE_SOURCE = 'live-mode'

/** The pacing of live mode, in milliseconds. */
export const LIVE_MODE_PACE = {
  /** The chat must be quiet this long before the character looks by herself. */
  quietBeforeLook: 45_000,
  /** At most one look in this time. */
  lookEvery: 40_000,
  /** The character can check on the owner once, when her message has no answer for this long. */
  noAnswer: 3 * 60_000,
  /** After that, she looks again only when the chat was quiet this long. */
  away: 15 * 60_000,
}

/** What live mode does on one beat. */
export type LiveModeStep = 'wait' | 'look' | 'check-in'

export interface LiveModeState {
  now: number
  /** Real messages of the conversation in order. Notices are left out. */
  messages: readonly { id: string, role: 'user' | 'assistant', at: number }[]
  lastLookAt: number
  /** The message of the character that she already got a check-in notice for. */
  checkedInFor?: string
}

/**
 * Decides the next live mode step. The character talks, then waits for an answer. She can check on the owner once
 * when the answer takes long, and after that she only looks again when the owner was away for a while.
 *
 * @example
 * nextLiveModeStep({ now: 100_000, messages: [], lastLookAt: 0 }) // 'look'
 */
export function nextLiveModeStep(state: LiveModeState): LiveModeStep {
  const last = state.messages.at(-1)
  const quietFor = last ? state.now - last.at : Number.POSITIVE_INFINITY
  if (quietFor < LIVE_MODE_PACE.quietBeforeLook || state.now - state.lastLookAt < LIVE_MODE_PACE.lookEvery)
    return 'wait'
  if (!last || last.role === 'user')
    return 'look'

  // The last message is hers, so she waits for an answer.
  if (state.checkedInFor !== last.id)
    return quietFor >= LIVE_MODE_PACE.noAnswer ? 'check-in' : 'wait'
  return quietFor >= LIVE_MODE_PACE.away ? 'look' : 'wait'
}

function messageTime(message: ChatHistoryItem) {
  const completedAt = (message as { completedAt?: unknown }).completedAt
  return typeof completedAt === 'number' ? completedAt : (message.createdAt ?? 0)
}

function isNotice(message: ChatHistoryItem) {
  return message.role === 'user' && Boolean(message.notice)
}

/** The real messages of a conversation, with their times, for {@link nextLiveModeStep}. */
export function conversationTimeline(messages: readonly ChatHistoryItem[]): LiveModeState['messages'] {
  return messages
    .filter(message => (message.role === 'user' || message.role === 'assistant') && !isNotice(message))
    .map(message => ({ id: message.id ?? '', role: message.role as 'user' | 'assistant', at: messageTime(message) }))
}

/**
 * A small grey picture of a screenshot. Two of them tell whether the screen changed, without any upload.
 */
async function fingerprint(bytes: Uint8Array<ArrayBuffer>, mimeType: string) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }))
  const canvas = new OffscreenCanvas(48, 27)
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  const grey = new Uint8Array(canvas.width * canvas.height)
  for (let index = 0; index < grey.length; index++)
    grey[index] = (data[index * 4] + data[index * 4 + 1] + data[index * 4 + 2]) / 3
  return grey
}

/** Whether two fingerprints differ enough to count as a new screen. */
export function screenChanged(before: Uint8Array | undefined, after: Uint8Array) {
  if (!before || before.length !== after.length)
    return true
  let difference = 0
  for (let index = 0; index < after.length; index++)
    difference += Math.abs(after[index] - before[index])
  return difference / after.length > 4
}

/** Replaces the images of a stored notice with a short note, so old screenshots do not ride along with every request. */
export function withoutImages(message: ChatHistoryItem): ChatHistoryItem {
  if (message.role !== 'user' || !Array.isArray(message.content))
    return message
  return {
    ...message,
    content: message.content.map(part => part.type === 'image_url' ? { type: 'text' as const, text: '[The screenshot of this moment was removed to save space.]' } : part),
  } as ChatHistoryItem
}

/**
 * FAIRY: live mode. While the owner has it on, the character in the active chat watches the screen and can start
 * talking by herself. A screenshot reaches her as a notice, so she decides from her own card what to say, or stays
 * quiet. A silent look leaves nothing in the chat, and a look she answered keeps its text without the image.
 */
export function setupLiveModeBridge(context: RendererContext) {
  const live = useLiveModeStore()
  const lookAtScreen = defineInvoke(context, electronLookAtScreen)

  let running = false
  let lastLookAt = 0
  let lastScreen: Uint8Array | undefined
  let checkedInFor: string | undefined

  async function cleanUp(sessionId: string, noticeId: string) {
    const sessions = useChatSessionStore()
    const messages = sessions.sessionMessages[sessionId] ?? []
    const index = messages.findIndex(message => message.id === noticeId)
    if (index < 0)
      return
    const answered = messages.slice(index + 1).some(message => message.role === 'assistant')
    if (!answered)
      await sessions.deleteMessage({ sessionId, messageId: noticeId })
    else
      await sessions.replaceSessionHistory(sessionId, messages.with(index, withoutImages(messages[index])))
  }

  async function beat() {
    const chat = useChatStore()
    const sessions = useChatSessionStore()
    const sessionId = sessions.activeSessionId
    if (!sessionId || chat.sending || chat.activeTurns.some(turn => turn.sessionId === sessionId))
      return

    const now = Date.now()
    const messages = conversationTimeline(sessions.sessionMessages[sessionId] ?? [])
    const step = nextLiveModeStep({ now, messages, lastLookAt, checkedInFor })
    if (step === 'wait')
      return

    const shot = await lookAtScreen()
    const bytes = Uint8Array.from(atob(shot.data), char => char.charCodeAt(0))
    const screen = await fingerprint(bytes, shot.mimeType)
    if (step === 'look' && !screenChanged(lastScreen, screen))
      return
    lastScreen = screen
    lastLookAt = now

    const last = messages.at(-1)
    const quiet = last ? formatDistanceStrict(last.at, now) : undefined
    let text: string
    if (step === 'check-in') {
      checkedInFor = last?.id
      text = `Live mode: the owner has not answered your last message for ${quiet}. The image is their screen right now.`
    }
    else {
      text = `Live mode: the owner turned on live mode, so you can watch their screen and talk with them while they do their thing. The image is their screen right now.${quiet ? ` The chat has been quiet for ${quiet}.` : ''}`
    }

    const noticeId = nanoid()
    await chat.notifyConversation(sessionId, {
      source: LIVE_MODE_SOURCE,
      text,
      messageId: noticeId,
      attachments: [{ type: 'image', mimeType: shot.mimeType, data: shot.data }],
    })
    await cleanUp(sessionId, noticeId)
  }

  return context.on(electronLiveModeTick, () => {
    // Only the main window gets the beat. A switch left on from an earlier app run turns off, so watching always
    // starts with a fresh choice of the owner.
    live.forgetEarlierRun(performance.timeOrigin)
    if (!live.enabled || running)
      return
    running = true
    beat()
      .catch(error => console.warn('[live-mode]', errorMessageFrom(error)))
      .finally(() => {
        running = false
      })
  })
}
