import type { InferOutput } from 'valibot'

import { Buffer } from 'node:buffer'
import { createCipheriv, createECDH, createPrivateKey, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { addHours, getUnixTime } from 'date-fns'
import { array, object, parse, string } from 'valibot'

import { FAIRY_DATA_DIR } from '../memory-files'

/**
 * FAIRY: notifications on the owner's phone, with standard Web Push (RFC 8291 and RFC 8292).
 *
 * - The phone page subscribes in its service worker. The subscription and this PC's signing key stay in
 *   `fairy-data/phone/push.json`.
 * - The phone's browser company runs the push service (Google for Chrome on Android). The message is encrypted for
 *   the phone, so that service only sees that a message came, not what it says.
 */

const log = useLogg('fairy-phone-push').useGlobalConfig()
const PUSH_FILE = join(FAIRY_DATA_DIR, 'phone', 'push.json')
/** A notification that cannot reach the phone within this time is dropped. */
const TTL_SECONDS = 24 * 60 * 60
/** RFC 8292 asks for a contact. The push services only need a valid address. */
const VAPID_SUBJECT = 'mailto:owner@example.com'

const subscriptionSchema = object({ endpoint: string(), keys: object({ p256dh: string(), auth: string() }) })
const pushFileSchema = object({ privateKey: string(), subscriptions: array(subscriptionSchema) })
export type PushSubscription = InferOutput<typeof subscriptionSchema>
type PushFile = InferOutput<typeof pushFileSchema>

/** The uncompressed P-256 point of a public key, as the Web Push key format wants it. */
function rawPublicKey(privateKeyPem: string) {
  const jwk = createPublicKey(createPrivateKey(privateKeyPem)).export({ format: 'jwk' })
  return Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, 'base64url'), Buffer.from(jwk.y!, 'base64url')])
}

let loaded: PushFile | undefined

async function loadPushFile(): Promise<PushFile> {
  if (loaded)
    return loaded
  if (existsSync(PUSH_FILE)) {
    loaded = parse(pushFileSchema, JSON.parse(await readFile(PUSH_FILE, 'utf8')))
    return loaded
  }
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  loaded = { privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), subscriptions: [] }
  await savePushFile()
  return loaded
}

async function savePushFile() {
  await mkdir(join(FAIRY_DATA_DIR, 'phone'), { recursive: true })
  await writeFile(PUSH_FILE, `${JSON.stringify(loaded, null, 2)}\n`)
}

/** The public key that the phone page subscribes with. */
export async function pushPublicKey() {
  return rawPublicKey((await loadPushFile()).privateKey).toString('base64url')
}

/** Keeps a phone's subscription. The same endpoint again replaces the old one. */
export async function addPushSubscription(subscription: unknown) {
  const next = parse(subscriptionSchema, subscription)
  if (!next.endpoint.startsWith('https://'))
    throw new Error('A push endpoint must use HTTPS.')
  const file = await loadPushFile()
  file.subscriptions = [...file.subscriptions.filter(old => old.endpoint !== next.endpoint), next]
  await savePushFile()
}

/** The VAPID `Authorization` header for one push service. */
export function vapidAuthorization(endpoint: string, privateKeyPem: string, now = new Date()) {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url')
  const claims = Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: getUnixTime(addHours(now, 12)), sub: VAPID_SUBJECT })).toString('base64url')
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: createPrivateKey(privateKeyPem), dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `vapid t=${header}.${claims}.${signature}, k=${rawPublicKey(privateKeyPem).toString('base64url')}`
}

/**
 * Encrypts a message for one phone, in the `aes128gcm` content coding of RFC 8291. The result is the whole request body.
 */
export function encryptPush(payload: Buffer, keys: { p256dh: string, auth: string }, salt = randomBytes(16)) {
  const phoneKey = Buffer.from(keys.p256dh, 'base64url')
  const authSecret = Buffer.from(keys.auth, 'base64url')
  const own = createECDH('prime256v1')
  const ownKey = own.generateKeys()
  const shared = own.computeSecret(phoneKey)

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), phoneKey, ownKey])
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32))
  const contentKey = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))

  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce)
  // 0x02 marks the last (and only) record.
  const sealed = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])

  const recordSize = Buffer.alloc(4)
  recordSize.writeUInt32BE(4096)
  return Buffer.concat([salt, recordSize, Buffer.from([ownKey.length]), ownKey, sealed])
}

/**
 * Shows a notification on every paired phone. Returns how many phones got it. A phone that unsubscribed is forgotten.
 */
export async function sendPhoneNotification(message: { title: string, body: string }) {
  const file = await loadPushFile()
  const payload = Buffer.from(JSON.stringify(message))
  let sent = 0
  const gone: string[] = []
  await Promise.all(file.subscriptions.map(async (subscription) => {
    try {
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': vapidAuthorization(subscription.endpoint, file.privateKey),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          'TTL': String(TTL_SECONDS),
          'Urgency': 'high',
        },
        body: encryptPush(payload, subscription.keys),
        signal: AbortSignal.timeout(15_000),
      })
      if (response.ok)
        sent++
      else if (response.status === 404 || response.status === 410)
        gone.push(subscription.endpoint)
      else
        log.warn(`the push service said ${response.status}: ${(await response.text()).slice(0, 200)}`)
    }
    catch (error) {
      log.warn(`could not reach the push service: ${errorMessageFrom(error)}`)
    }
  }))
  if (gone.length) {
    file.subscriptions = file.subscriptions.filter(subscription => !gone.includes(subscription.endpoint))
    await savePushFile()
  }
  return { sent, phones: file.subscriptions.length }
}
