import type { createContext } from '@moeru/eventa/adapters/electron/renderer'
import type { PcmBlock } from '@proj-airi/pipelines-audio'
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import type { PhoneChatReply, PhoneChatRequest } from '../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { toSpeechText } from '@proj-airi/core-agent'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'

import { electronPhoneChatReply, electronPhoneChatRequest } from '../../shared/eventa'
import { artistryToolReferences } from '../stores/tools'

type RendererContext = ReturnType<typeof createContext>['context']

const HISTORY_LENGTH = 30
/** The phone page records voice messages at this rate. */
export const PHONE_SAMPLE_RATE = 16_000
const VOICE_TIMEOUT_MS = 60_000

/** Visible text of a stored message, without the hidden stage tokens such as `<|ACT ...|>`. */
export function visibleText(message: ChatHistoryItem): string {
  const content = (message as { content?: unknown }).content
  const raw = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(part => (part && typeof part === 'object' && (part as { type?: string }).type === 'text') ? String((part as { text?: unknown }).text ?? '') : '').join('')
      : ''
  return raw.replace(/<(?:\||\{'\|'\})[\s\S]*?(?:\||\{'\|'\})>/g, '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

function toPhoneMessages(messages: readonly ChatHistoryItem[]) {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({ role: message.role as 'user' | 'assistant', text: visibleText(message) }))
    .filter(message => message.text)
}

/**
 * Turns a phone voice message into one block of audio samples.
 *
 * @example
 * pcm16ToBlock('AAD/fw==') // two samples: 0 and almost 1
 */
export function pcm16ToBlock(base64: string): PcmBlock {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const samples = new Float32Array(bytes.byteLength >> 1)
  for (let index = 0; index < samples.length; index++)
    samples[index] = view.getInt16(index * 2, true) / 32768
  return { range: { sourceId: 'phone', startFrame: 0, endFrame: samples.length }, sampleRate: PHONE_SAMPLE_RATE, channels: [samples] }
}

/** Transcribes a phone voice message with the hearing module of the PC. */
async function transcribe(base64: string, signal: AbortSignal): Promise<string> {
  const hearing = useHearingStore()
  if (!hearing.configured)
    throw new Error('Hearing is not set up on the PC yet. Set it up in Settings, Modules, Hearing.')
  const block = pcm16ToBlock(base64)
  const audio = new ReadableStream<PcmBlock>({
    start(controller) {
      controller.enqueue(block)
      controller.close()
    },
  })
  const reader = hearing.createTranscriber().transcribe({ audio, signal }).getReader()
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    if (value.type === 'update')
      text = value.segments.map(segment => segment.text).join('')
  }
  return text.trim()
}

function audioType(bytes: Uint8Array) {
  const head = String.fromCharCode(...bytes.subarray(0, 4))
  if (head === 'RIFF')
    return 'audio/wav'
  if (head === 'OggS')
    return 'audio/ogg'
  if (head === 'fLaC')
    return 'audio/flac'
  return 'audio/mpeg'
}

async function toDataUrl(audio: Blob) {
  const bytes = new Uint8Array(await audio.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return `data:${audioType(bytes)};base64,${btoa(binary)}`
}

/** The name of the character in a session, for the phone page. */
function characterNameOf(sessionId: string): string | undefined {
  const [characterId] = useChatSessionStore().characterMembersOf(sessionId)
  return characterId ? useAiriCardStore().getCard(characterId)?.name : undefined
}

/** Speaks the reply with the voice of the character in the session. Returns nothing when speech is not set up. */
async function speak(sessionId: string, text: string, signal: AbortSignal): Promise<string | undefined> {
  const [characterId] = useChatSessionStore().characterMembersOf(sessionId)
  if (!characterId)
    return undefined
  const selection = useAiriCardStore().getModules(characterId).speech
  const audio = await useSpeechStore().synthesizeText(selection, toSpeechText(text), signal)
  return audio ? await toDataUrl(audio) : undefined
}

/**
 * FAIRY: answers messages from the phone page in this window. A phone message joins the active chat, so the phone and
 * the PC share one conversation, one memory, and every tool. A voice message goes through the hearing module of the
 * PC, and a spoken reply comes from its speech module.
 */
export function setupPhoneChatBridge(context: RendererContext) {
  const reply = defineInvoke(context, electronPhoneChatReply)
  const send = (answer: PhoneChatReply, sessionId: string) => reply({ ...answer, character: characterNameOf(sessionId) }).catch(error => console.warn('[phone] reply failed', errorMessageFrom(error)))

  async function answer(request: PhoneChatRequest, sessionId: string): Promise<PhoneChatReply> {
    const signal = AbortSignal.timeout(VOICE_TIMEOUT_MS)
    const heard = request.audio ? await transcribe(request.audio, signal) : undefined
    if (request.audio && !heard)
      return { id: request.id, ok: false, error: 'That was not clear. Try again a bit closer to the mic.' }

    const match = request.image ? /^data:(image\/[\w+]+);base64,(.+)$/.exec(request.image) : null
    const result = await useChatStore().send({
      sessionId,
      text: heard ?? request.text ?? '',
      attachments: match ? [{ type: 'image', mimeType: match[1], data: match[2] }] : undefined,
      tools: artistryToolReferences,
    })
    const text = toPhoneMessages(result.messages).filter(message => message.role === 'assistant').map(message => message.text).join('\n\n')
    let speech: string | undefined
    if (request.speak) {
      try {
        speech = await speak(sessionId, text, AbortSignal.timeout(VOICE_TIMEOUT_MS))
      }
      catch (error) {
        console.warn('[phone] speech failed', errorMessageFrom(error))
      }
    }
    return { id: request.id, ok: true, heard, reply: text, speech }
  }

  return context.on(electronPhoneChatRequest, async (event) => {
    const request = event.body
    if (!request)
      return
    const sessions = useChatSessionStore()
    const sessionId = sessions.activeSessionId
    try {
      if (request.kind === 'history') {
        const messages = sessions.sessionMessages[sessionId] ?? []
        await send({ id: request.id, ok: true, messages: toPhoneMessages(messages.slice(-HISTORY_LENGTH)) }, sessionId)
        return
      }
      await send(await answer(request, sessionId), sessionId)
    }
    catch (error) {
      await send({ id: request.id, ok: false, error: errorMessageFrom(error) ?? 'No answer came.' }, sessionId)
    }
  })
}
