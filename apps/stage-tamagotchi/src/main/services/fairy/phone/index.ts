import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { FairyMode, PhoneCard, PhoneChatReply, PhoneChatRequest } from '../../../../shared/eventa'

import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { eventHandler, H3 } from 'h3'

import { electronPhoneChatReply, electronPhoneChatRequest, electronPhoneInfo, electronPhoneNotify, FAIRY_MODES } from '../../../../shared/eventa'
import { createH3Server } from '../../airi/http-server/server'
import { FAIRY_DATA_DIR } from '../memory-files'
import { readModes, setMode } from '../modes'
import { PHONE_ICON_SVG, PHONE_MANIFEST, PHONE_PAGE_HTML, PHONE_SERVICE_WORKER } from './page'
import { addPushSubscription, pushPublicKey, sendPhoneNotification } from './push'

/**
 * FAIRY: the phone page. The PC serves a chat page that a phone opens over Tailscale, so there is one character with one
 * memory, and the phone is only a window to her.
 *
 * - The server listens on 127.0.0.1 only. `tailscale serve` forwards the private Tailscale address to it with HTTPS,
 *   so it is never on the local network or the internet.
 * - Every API call needs the pairing key from `fairy-data/phone/key.txt` (it comes in the QR code link).
 * - A message goes to the main window, which sends it into the active chat and returns the character's reply.
 * - The character can also message the phone first, with a notification (see ./push.ts).
 */

export const PHONE_PORT = 7461
const execFileAsync = promisify(execFile)
const REPLY_TIMEOUT_MS = 120_000
const MAX_BODY_BYTES = 8 * 1024 * 1024
const APP_FILE = join(FAIRY_DATA_DIR, 'phone', 'fairy-phone.apk')

const log = useLogg('fairy-phone').useGlobalConfig()

type MainContext = ReturnType<typeof createContext>['context']

let pairingKey: string | undefined
async function getPairingKey() {
  if (pairingKey)
    return pairingKey
  const dir = join(FAIRY_DATA_DIR, 'phone')
  const file = join(dir, 'key.txt')
  if (existsSync(file))
    pairingKey = (await readFile(file, 'utf8')).trim()
  if (!pairingKey) {
    pairingKey = randomBytes(24).toString('base64url')
    await mkdir(dir, { recursive: true })
    await writeFile(file, pairingKey, 'utf8')
  }
  return pairingKey
}

function keyMatches(given: string | null, expected: string) {
  if (!given)
    return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// -- The main window answers phone requests --

let mainContext: MainContext | undefined
const pending = new Map<string, (reply: PhoneChatReply) => void>()

function askMainWindow(request: Omit<PhoneChatRequest, 'id'>): Promise<PhoneChatReply> {
  if (!mainContext)
    return Promise.resolve({ id: '', ok: false, error: 'AIRI is still starting. Try again in a moment.' })
  const id = randomUUID()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve({ id, ok: false, error: 'The answer took too long.' })
    }, REPLY_TIMEOUT_MS)
    pending.set(id, (reply) => {
      clearTimeout(timer)
      resolve(reply)
    })
    mainContext!.emit(electronPhoneChatRequest, { id, ...request })
  })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

// -- The HTTP server --

let started: Promise<void> | undefined

export function startPhoneServer() {
  started ??= (async () => {
    const key = await getPairingKey()
    const app = new H3()

    app.get('/', eventHandler(() => new Response(PHONE_PAGE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })))
    app.get('/manifest.webmanifest', eventHandler(() => new Response(PHONE_MANIFEST, { headers: { 'Content-Type': 'application/manifest+json' } })))
    app.get('/icon.svg', eventHandler(() => new Response(PHONE_ICON_SVG, { headers: { 'Content-Type': 'image/svg+xml' } })))
    // The phone app, built by apps/fairy-phone/build-app.cmd. A plain download link cannot send a header, so the
    // pairing key comes in the query here.
    app.get('/fairy-phone.apk', eventHandler(async (event) => {
      if (!keyMatches(new URL(event.req.url).searchParams.get('key'), key))
        return json({ ok: false, error: 'Not paired' }, 401)
      if (!existsSync(APP_FILE))
        return json({ ok: false, error: 'The app is not built yet.' }, 404)
      return new Response(new Uint8Array(await readFile(APP_FILE)), { headers: { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="fairy-phone.apk"', 'Cache-Control': 'no-store' } })
    }))
    app.get('/sw.js', eventHandler(() => new Response(PHONE_SERVICE_WORKER, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' } })))

    app.get('/api/push-key', eventHandler(async (event) => {
      if (!keyMatches(event.req.headers.get('x-fairy-key'), key))
        return json({ ok: false, error: 'Not paired' }, 401)
      return json({ ok: true, key: await pushPublicKey() })
    }))

    app.post('/api/push-subscribe', eventHandler(async (event) => {
      if (!keyMatches(event.req.headers.get('x-fairy-key'), key))
        return json({ ok: false, error: 'Not paired' }, 401)
      try {
        await addPushSubscription(JSON.parse((await event.req.text()).slice(0, 4000)))
      }
      catch {
        return json({ ok: false, error: 'Bad request' }, 400)
      }
      return json({ ok: true })
    }))

    app.get('/api/history', eventHandler(async (event) => {
      if (!keyMatches(event.req.headers.get('x-fairy-key'), key))
        return json({ ok: false, error: 'Not paired' }, 401)
      const reply = await askMainWindow({ kind: 'history' })
      return reply.ok ? json({ ok: true, messages: reply.messages ?? [], character: reply.character, characterId: reply.characterId }) : json({ ok: false, error: reply.error }, 503)
    }))

    app.get('/api/characters', eventHandler(async (event) => {
      if (!keyMatches(event.req.headers.get('x-fairy-key'), key))
        return json({ ok: false, error: 'Not paired' }, 401)
      const reply = await askMainWindow({ kind: 'characters' })
      return reply.ok ? json({ ok: true, characters: reply.characters ?? [], character: reply.character, characterId: reply.characterId }) : json({ ok: false, error: reply.error }, 503)
    }))

    app.post('/api/switch', eventHandler(async (event) => {
      if (!keyMatches(event.req.headers.get('x-fairy-key'), key))
        return json({ ok: false, error: 'Not paired' }, 401)
      let body: { id?: unknown }
      try {
        body = JSON.parse((await event.req.text()).slice(0, 1000))
      }
      catch {
        return json({ ok: false, error: 'Bad request' }, 400)
      }
      if (typeof body.id !== 'string' || !body.id)
        return json({ ok: false, error: 'Bad request' }, 400)
      const reply = await askMainWindow({ kind: 'switch', characterId: body.id.slice(0, 200) })
      return reply.ok ? json({ ok: true, character: reply.character, characterId: reply.characterId }) : json({ ok: false, error: reply.error }, 503)
    }))

    // -- The app's chat list, character card, and controls --
    const paired = (event: { req: Request }) => keyMatches(event.req.headers.get('x-fairy-key'), key)
    const readBody = async (event: { req: Request }, limit: number): Promise<Record<string, unknown> | undefined> => {
      try {
        const body = JSON.parse((await event.req.text()).slice(0, limit))
        return body && typeof body === 'object' ? body : undefined
      }
      catch {
        return undefined
      }
    }
    const answer = (reply: PhoneChatReply, data: Record<string, unknown>) =>
      reply.ok ? json({ ok: true, character: reply.character, characterId: reply.characterId, ...data }) : json({ ok: false, error: reply.error }, 503)

    app.get('/api/chats', eventHandler(async (event) => {
      if (!paired(event))
        return json({ ok: false, error: 'Not paired' }, 401)
      const reply = await askMainWindow({ kind: 'chats' })
      return answer(reply, { chats: reply.chats ?? [] })
    }))

    app.post('/api/open-chat', eventHandler(async (event) => {
      if (!paired(event))
        return json({ ok: false, error: 'Not paired' }, 401)
      const body = await readBody(event, 1000)
      if (typeof body?.id !== 'string' || !body.id)
        return json({ ok: false, error: 'Bad request' }, 400)
      const reply = await askMainWindow({ kind: 'open-chat', sessionId: body.id.slice(0, 200) })
      return answer(reply, { sessionId: reply.sessionId })
    }))

    app.post('/api/new-chat', eventHandler(async (event) => {
      if (!paired(event))
        return json({ ok: false, error: 'Not paired' }, 401)
      const reply = await askMainWindow({ kind: 'new-chat' })
      return answer(reply, { sessionId: reply.sessionId })
    }))

    app.get('/api/card', eventHandler(async (event) => {
      if (!paired(event))
        return json({ ok: false, error: 'Not paired' }, 401)
      const reply = await askMainWindow({ kind: 'card' })
      return answer(reply, { card: reply.card })
    }))

    app.post('/api/card', eventHandler(async (event) => {
      if (!paired(event))
        return json({ ok: false, error: 'Not paired' }, 401)
      const body = await readBody(event, 100_000)
      if (!body)
        return json({ ok: false, error: 'Bad request' }, 400)
      const card: Partial<PhoneCard> = {}
      for (const field of ['description', 'personality', 'scenario'] as const) {
        if (typeof body[field] === 'string')
          card[field] = body[field]
      }
      const reply = await askMainWindow({ kind: 'save-card', card })
      return answer(reply, { card: reply.card })
    }))

    async function controls() {
      const look = await askMainWindow({ kind: 'look' })
      return { ok: true, modes: readModes(), sprite: look.ok ? look.sprite : undefined }
    }

    app.get('/api/controls', eventHandler(async (event) => {
      if (!paired(event))
        return json({ ok: false, error: 'Not paired' }, 401)
      return json(await controls())
    }))

    app.post('/api/controls', eventHandler(async (event) => {
      if (!paired(event))
        return json({ ok: false, error: 'Not paired' }, 401)
      const body = await readBody(event, 1000)
      if (typeof body?.mode !== 'string' || typeof body.on !== 'boolean')
        return json({ ok: false, error: 'Bad request' }, 400)
      if (body.mode === 'sprite')
        await askMainWindow({ kind: 'look', sprite: body.on })
      else if ((FAIRY_MODES as readonly string[]).includes(body.mode))
        await setMode(body.mode as FairyMode, body.on)
      else
        return json({ ok: false, error: 'Bad request' }, 400)
      return json(await controls())
    }))

    app.post('/api/send', eventHandler(async (event) => {
      if (!keyMatches(event.req.headers.get('x-fairy-key'), key))
        return json({ ok: false, error: 'Not paired' }, 401)
      const raw = await event.req.text()
      if (raw.length > MAX_BODY_BYTES)
        return json({ ok: false, error: 'The photo is too large.' }, 413)
      let body: { text?: unknown, image?: unknown, audio?: unknown, speak?: unknown }
      try {
        body = JSON.parse(raw)
      }
      catch {
        return json({ ok: false, error: 'Bad request' }, 400)
      }
      const text = typeof body.text === 'string' ? body.text.slice(0, 4000) : ''
      const image = typeof body.image === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/.test(body.image) ? body.image : undefined
      const audio = typeof body.audio === 'string' && /^[A-Z0-9+/]+={0,2}$/i.test(body.audio) ? body.audio : undefined
      if (!text.trim() && !image && !audio)
        return json({ ok: false, error: 'Empty message' }, 400)
      const reply = await askMainWindow({ kind: 'send', text, image, audio, speak: body.speak === true })
      return reply.ok
        ? json({ ok: true, heard: reply.heard, reply: reply.reply ?? '', speech: reply.speech, character: reply.character, characterId: reply.characterId })
        : json({ ok: false, error: reply.error }, 503)
    }))

    const server = createH3Server({ app, host: '127.0.0.1', port: PHONE_PORT })
    const address = await server.start()
    log.log(`phone page listening on ${address.baseUrl} (reach it through tailscale serve)`)
  })().catch((error) => {
    started = undefined
    log.withError(error).warn('phone page server did not start')
  })
  return started
}

/** Registers the main window as the one that answers phone messages. */
export function createPhoneService(params: { context: MainContext }) {
  mainContext = params.context
  void startPhoneServer()
  defineInvokeHandler(params.context, electronPhoneNotify, ({ title, text }) => sendPhoneNotification({ title: title.slice(0, 80), body: text.slice(0, 500) }))
  defineInvokeHandler(params.context, electronPhoneChatReply, (reply) => {
    pending.get(reply.id)?.(reply)
    pending.delete(reply.id)
  })
}

/** Lets any window, such as Settings, read the pairing link for the QR code. */
export function createPhoneInfoService(params: { context: MainContext }) {
  defineInvokeHandler(params.context, electronPhoneInfo, async () => ({ port: PHONE_PORT, key: await getPairingKey(), url: await tailnetUrl() }))
}

const TAILSCALE_PATHS = ['tailscale', 'C:\\Program Files\\Tailscale\\tailscale.exe']

/** This PC's private HTTPS address on the Tailscale network, for example https://noocy.tail1234.ts.net/. */
async function tailnetUrl(): Promise<string | undefined> {
  for (const command of TAILSCALE_PATHS) {
    try {
      const { stdout } = await execFileAsync(command, ['status', '--json'], { timeout: 5000, windowsHide: true })
      const dnsName = (JSON.parse(stdout) as { Self?: { DNSName?: string } }).Self?.DNSName?.replace(/\.$/, '')
      if (dnsName)
        return `https://${dnsName}/`
    }
    catch {
      // Try the next location.
    }
  }
  return undefined
}
