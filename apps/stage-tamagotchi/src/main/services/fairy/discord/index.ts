import type { AudioPlayer, VoiceConnection } from '@discordjs/voice'
import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { Guild, Message, VoiceBasedChannel } from 'discord.js'
import type { InferOutput } from 'valibot'

import type { DiscordTurnReply, DiscordTurnRequest } from '../../../../shared/eventa'

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import prism from 'prism-media'

import { AudioPlayerStatus, createAudioPlayer, createAudioResource, EndBehaviorType, entersState, getVoiceConnection, joinVoiceChannel, StreamType, VoiceConnectionStatus } from '@discordjs/voice'
import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'
import { ChannelType, Client, Events, GatewayIntentBits, Partials } from 'discord.js'
import { array, object, optional, parse, string } from 'valibot'

import { electronDiscordReply, electronDiscordTurn } from '../../../../shared/eventa'
import { LOCAL_VOICE_PORT } from '../local-voice'
import { FAIRY_DATA_DIR } from '../memory-files'
import { discordPcmSeconds, discordPcmToHearing, HEARING_RATE, monoToDiscordPcm, monoWav } from './audio'
import { callCommand, callsName, isNoise, nameSpellings } from './words'

/**
 * FAIRY: the character's own Discord bot. She answers when someone names or mentions her in a text channel, and she
 * joins voice calls, where she hears each person apart, answers out loud, and leaves when asked.
 *
 * She gets no PC tools on Discord, so people in a server cannot make her act on the owner's PC.
 * Hearing and speech run on this PC through the local voice server. Only the chat model sees the words.
 *
 * The token lives in `fairy-data/discord-bot.json`, which git ignores. The owner pastes it there.
 */

const SETTINGS_FILE = join(FAIRY_DATA_DIR, 'discord-bot.json')
const log = useLogg('fairy-discord').useGlobalConfig()

/** The owner edits this file by hand, so a missing field gets its default. */
const settingsSchema = object({
  token: optional(string(), ''),
  /** The character card name. An empty name uses the active character. */
  character: optional(string(), 'Lumi'),
  /** More spellings of her name that speech recognition writes. */
  nameSpellings: optional(array(string()), []),
})
type BotSettings = InferOutput<typeof settingsSchema>

const SETTINGS_TEMPLATE: BotSettings = { token: '', character: 'Lumi', nameSpellings: [] }

/** A pause this long ends a spoken line. */
const END_OF_LINE_MS = 900
/** Shorter clips are coughs and clicks. */
const MIN_LINE_SECONDS = 0.5
/** A longer line is cut, so one person cannot fill the hearing queue. */
const MAX_LINE_SECONDS = 30
/** After she speaks, the next line in the call is for her even without her name, for this long. */
const FOLLOW_UP_MS = 20_000
const TURN_TIMEOUT_MS = 120_000
/** Lines that wait longer than this for her turn are dropped, because the call moved on. */
const MAX_WAITING_LINES = 2
/** Discord allows 2000 characters in one message. */
const MAX_MESSAGE_LENGTH = 1900

async function loadSettings(): Promise<BotSettings | undefined> {
  if (!existsSync(SETTINGS_FILE)) {
    await mkdir(FAIRY_DATA_DIR, { recursive: true })
    await writeFile(SETTINGS_FILE, `${JSON.stringify(SETTINGS_TEMPLATE, null, 2)}\n`)
    log.log(`made ${SETTINGS_FILE}. Paste the bot token there and restart AIRI to start the Discord bot.`)
    return undefined
  }
  const settings = parse(settingsSchema, JSON.parse(await readFile(SETTINGS_FILE, 'utf8')))
  if (!settings.token.trim()) {
    log.log(`no token in ${SETTINGS_FILE}, so the Discord bot stays off`)
    return undefined
  }
  return settings
}

async function transcribe(pcm: Uint8Array): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([monoWav(discordPcmToHearing(pcm), HEARING_RATE)], { type: 'audio/wav' }), 'line.wav')
  const response = await fetch(`http://127.0.0.1:${LOCAL_VOICE_PORT}/v1/audio/transcriptions`, { method: 'POST', body: form })
  if (!response.ok)
    throw new Error(`hearing answered ${response.status}`)
  return ((await response.json()) as { text?: string }).text?.trim() ?? ''
}

function splitMessage(text: string) {
  const parts: string[] = []
  for (let rest = text.trim(); rest; rest = rest.slice(MAX_MESSAGE_LENGTH).trim())
    parts.push(rest.slice(0, MAX_MESSAGE_LENGTH))
  return parts
}

/** One voice call: the connection, the player for her speech, and the people she hears. */
interface Call {
  guild: Guild
  channel: VoiceBasedChannel
  connection: VoiceConnection
  player: AudioPlayer
  listening: Set<string>
  waiting: number
  lastSpokeAt: number
}

export function createDiscordBotService(params: { context: ReturnType<typeof createContext>['context'] }) {
  const pending = new Map<string, (reply: DiscordTurnReply) => void>()
  /** One turn at a time, so her replies come in the order people spoke. */
  const turns = new Mutex()
  const calls = new Map<string, Call>()
  let client: Client | undefined
  let stopped = false

  defineInvokeHandler(params.context, electronDiscordReply, (reply) => {
    pending.get(reply.id)?.(reply)
    pending.delete(reply.id)
  })

  /** Asks the character in the main window and waits for her answer. */
  function ask(request: Omit<DiscordTurnRequest, 'id' | 'character'>, settings: BotSettings): Promise<DiscordTurnReply> {
    const id = randomUUID()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve({ id, ok: false, error: 'The answer took too long.' })
      }, TURN_TIMEOUT_MS)
      pending.set(id, (reply) => {
        clearTimeout(timer)
        resolve(reply)
      })
      params.context.emit(electronDiscordTurn, { ...request, id, character: settings.character })
    })
  }

  async function speak(call: Call, speech: string) {
    const pcm = monoToDiscordPcm(new Uint8Array(Buffer.from(speech, 'base64')))
    call.player.play(createAudioResource(Readable.from([pcm]), { inputType: StreamType.Raw }))
    await entersState(call.player, AudioPlayerStatus.Playing, 5_000).catch(() => {})
    await entersState(call.player, AudioPlayerStatus.Idle, 5 * 60_000).catch(() => {})
    call.lastSpokeAt = Date.now()
  }

  function leave(guildId: string) {
    const call = calls.get(guildId)
    calls.delete(guildId)
    call?.player.stop(true)
    ;(call?.connection ?? getVoiceConnection(guildId))?.destroy()
  }

  async function join(channel: VoiceBasedChannel, settings: BotSettings) {
    leave(channel.guild.id)
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    })
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000)
    const player = createAudioPlayer()
    connection.subscribe(player)
    const call: Call = { guild: channel.guild, channel, connection, player, listening: new Set(), waiting: 0, lastSpokeAt: 0 }
    calls.set(channel.guild.id, call)
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      // Discord can move or reconnect a call. Only a call that stays down ends.
      void Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]).catch(() => leave(channel.guild.id))
    })
    connection.receiver.speaking.on('start', userId => void hear(call, userId, settings))
    log.log(`joined the voice call ${channel.name} on ${channel.guild.name}`)
  }

  /** Records one spoken line of one person, then hands it to the character when it is for her. */
  async function hear(call: Call, userId: string, settings: BotSettings) {
    if (call.listening.has(userId) || userId === client?.user?.id)
      return
    const member = call.guild.members.cache.get(userId) ?? await call.guild.members.fetch(userId).catch(() => undefined)
    if (!member || member.user.bot)
      return
    call.listening.add(userId)
    try {
      const opus = call.connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: END_OF_LINE_MS } })
      const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48_000 })
      const chunks: Buffer[] = []
      let bytes = 0
      await new Promise<void>((resolve) => {
        opus.pipe(decoder)
        decoder.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
          bytes += chunk.length
          if (discordPcmSeconds(new Uint8Array(bytes)) > MAX_LINE_SECONDS)
            opus.destroy()
        })
        decoder.once('end', () => resolve())
        decoder.once('error', () => resolve())
        opus.once('close', () => resolve())
      })
      const pcm = new Uint8Array(Buffer.concat(chunks))
      if (discordPcmSeconds(pcm) < MIN_LINE_SECONDS)
        return
      const text = await transcribe(pcm)
      if (isNoise(text))
        return
      const names = nameSpellings(settings.character || 'Lumi', settings.nameSpellings)
      const forHer = callsName(text, names) || Date.now() - call.lastSpokeAt < FOLLOW_UP_MS
      log.log(`heard ${member.displayName}${forHer ? ' (to her)' : ''}: ${text}`)
      if (!forHer)
        return
      if (callCommand(text) === 'leave') {
        leave(call.guild.id)
        return
      }
      if (call.waiting >= MAX_WAITING_LINES)
        return
      call.waiting++
      await turns.runExclusive(async () => {
        call.waiting--
        if (calls.get(call.guild.id) !== call)
          return
        const reply = await ask({ place: `the voice call ${call.channel.name} on ${call.guild.name}`, speaker: member.displayName, text, voice: true }, settings)
        if (!reply.ok)
          log.warn(`no voice answer: ${reply.error}`)
        else if (reply.speech && calls.get(call.guild.id) === call)
          await speak(call, reply.speech)
      })
    }
    catch (error) {
      log.warn(`hearing ${userId} failed: ${errorMessageFrom(error)}`)
    }
    finally {
      call.listening.delete(userId)
    }
  }

  async function onMessage(message: Message, settings: BotSettings) {
    const self = client?.user
    if (!self || message.author.bot)
      return
    const direct = message.channel.type === ChannelType.DM
    const names = nameSpellings(settings.character || 'Lumi', settings.nameSpellings)
    const text = message.content.replaceAll(`<@${self.id}>`, settings.character || 'Lumi').trim()
    if (!direct && !message.mentions.users.has(self.id) && !callsName(text, names))
      return

    const command = message.guild ? callCommand(text) : undefined
    if (command && message.guild) {
      if (command === 'leave') {
        leave(message.guild.id)
        await message.react('👋').catch(() => {})
        return
      }
      const channel = message.member?.voice.channel
      if (!channel) {
        await message.reply('Join a voice channel first, then ask me again.')
        return
      }
      await join(channel, settings).then(() => message.react('🎧')).catch(error => message.reply(`I could not join: ${errorMessageFrom(error)}`))
      return
    }

    const place = direct ? 'a direct message' : `#${'name' in message.channel ? message.channel.name : 'chat'} on ${message.guild?.name ?? 'Discord'}`
    await turns.runExclusive(async () => {
      if ('sendTyping' in message.channel)
        await message.channel.sendTyping().catch(() => {})
      const reply = await ask({ place, speaker: message.member?.displayName ?? message.author.displayName, text, voice: false }, settings)
      if (!reply.ok || !reply.reply) {
        log.warn(`no text answer: ${reply.error}`)
        return
      }
      for (const part of splitMessage(reply.reply))
        await message.reply({ content: part, allowedMentions: { repliedUser: false, parse: [] } })
    }).catch(error => log.warn(`text answer failed: ${errorMessageFrom(error)}`))
  }

  async function start() {
    const settings = await loadSettings()
    if (!settings || stopped)
      return
    client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
      partials: [Partials.Channel],
    })
    client.once(Events.ClientReady, ready => log.log(`the Discord bot is online as ${ready.user.tag} in ${ready.guilds.cache.size} server(s)`))
    client.on(Events.MessageCreate, message => void onMessage(message, settings))
    client.on(Events.Error, error => log.warn(`Discord error: ${errorMessageFrom(error)}`))
    await client.login(settings.token.trim())
  }

  void start().catch(error => log.warn(`the Discord bot did not start: ${errorMessageFrom(error)}`))

  return () => {
    stopped = true
    for (const guildId of [...calls.keys()])
      leave(guildId)
    void client?.destroy()
    client = undefined
  }
}
