import type { createContext } from '@moeru/eventa/adapters/electron/renderer'

import type { DiscordTurnReply, DiscordTurnRequest } from '../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { toSpeechText } from '@proj-airi/core-agent'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'

import { electronDiscordReply, electronDiscordTurn } from '../../shared/eventa'
import { visibleText } from './phone-chat'

type RendererContext = ReturnType<typeof createContext>['context']

/** Discord plays 48 kHz audio, so her speech is decoded at that rate. */
const DISCORD_RATE = 48_000
const SPEECH_TIMEOUT_MS = 60_000
const SESSION_KEY_PREFIX = 'fairy/discord-session/'

/**
 * The note before each Discord line. It says where the words come from and who said them. It sets no rules for how
 * she talks: her card does that.
 */
export function discordNote(request: Pick<DiscordTurnRequest, 'place' | 'speaker' | 'text' | 'voice'>) {
  const where = request.voice
    ? `[Discord: ${request.speaker} said this out loud in ${request.place}. Your answer is spoken aloud to everyone in the call.]`
    : `[Discord: ${request.speaker} wrote this in ${request.place}. Your answer is posted there.]`
  return `${where}\n${request.text}`
}

/** The card named in the bot settings, or the active one when the name is empty or unknown. */
function characterIdFor(name: string): string | undefined {
  const cards = useAiriCardStore()
  const wanted = name.trim().toLowerCase()
  const match = wanted ? [...cards.cards].find(([, card]) => card.name.trim().toLowerCase() === wanted) : undefined
  return match?.[0] ?? cards.activeCardId
}

/** Her own Discord chat on the PC, apart from the owner's private chats with her. It is made once and kept. */
async function discordSessionOf(characterId: string): Promise<string> {
  const sessions = useChatSessionStore()
  const key = SESSION_KEY_PREFIX + characterId
  const saved = localStorage.getItem(key)
  if (saved && await sessions.loadSession(saved))
    return saved
  const sessionId = await sessions.createSession(characterId, { setActive: false, title: 'Discord' })
  localStorage.setItem(key, sessionId)
  return sessionId
}

/** Mono 16-bit PCM at 48 kHz, as base64. */
async function toDiscordSpeech(audio: Blob): Promise<string> {
  const context = new AudioContext({ sampleRate: DISCORD_RATE })
  try {
    const decoded = await context.decodeAudioData(await audio.arrayBuffer())
    const samples = decoded.getChannelData(0)
    const pcm = new Int16Array(samples.length)
    samples.forEach((sample, index) => {
      pcm[index] = Math.round(Math.max(-1, Math.min(1, sample)) * 32767)
    })
    let binary = ''
    const bytes = new Uint8Array(pcm.buffer)
    for (let index = 0; index < bytes.length; index += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    return btoa(binary)
  }
  finally {
    void context.close()
  }
}

/**
 * FAIRY: answers the character's Discord bot. Each line goes into her Discord chat with no tools, so people on
 * Discord can only talk with her. They cannot make her act on the owner's PC. Only the main window runs this.
 */
export function setupDiscordBridge(context: RendererContext) {
  const reply = defineInvoke(context, electronDiscordReply)
  const send = (answer: DiscordTurnReply) => reply(answer).catch(error => console.warn('[discord] reply failed', errorMessageFrom(error)))

  async function answer(request: DiscordTurnRequest): Promise<DiscordTurnReply> {
    const characterId = characterIdFor(request.character)
    if (!characterId)
      return { id: request.id, ok: false, error: 'No character card.' }
    const sessionId = await discordSessionOf(characterId)
    const result = await useChatStore().send({ sessionId, text: discordNote(request), tools: [] })
    const text = result.messages.filter(message => message.role === 'assistant').map(visibleText).join('\n\n').trim()
    if (!text)
      return { id: request.id, ok: false, error: 'She chose not to answer.' }
    if (!request.voice)
      return { id: request.id, ok: true, reply: text }
    const selection = useAiriCardStore().getModules(characterId).speech
    const audio = await useSpeechStore().synthesizeText(selection, toSpeechText(text), AbortSignal.timeout(SPEECH_TIMEOUT_MS))
    return { id: request.id, ok: true, reply: text, speech: audio ? await toDiscordSpeech(audio) : undefined }
  }

  return context.on(electronDiscordTurn, async (event) => {
    const request = event.body
    if (!request)
      return
    try {
      await send(await answer(request))
    }
    catch (error) {
      await send({ id: request.id, ok: false, error: errorMessageFrom(error) ?? 'No answer came.' })
    }
  })
}
