import { Buffer } from 'node:buffer'
import { createDecipheriv, createECDH, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, verify } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { encryptPush, vapidAuthorization } from './push'

vi.mock('../memory-files', () => ({ FAIRY_DATA_DIR: '/home/user/fairy-data' }))

/** What the phone's browser does with a push message (RFC 8291). */
function decryptAsPhone(body: Buffer, phone: ReturnType<typeof createECDH>, authSecret: Buffer) {
  const salt = body.subarray(0, 16)
  const keyLength = body[20]
  const serverKey = body.subarray(21, 21 + keyLength)
  const sealed = body.subarray(21 + keyLength)
  const shared = phone.computeSecret(serverKey)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), phone.getPublicKey(), serverKey])
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32))
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const decipher = createDecipheriv('aes-128-gcm', key, nonce)
  decipher.setAuthTag(sealed.subarray(-16))
  const plain = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()])
  return { recordSize: body.readUInt32BE(16), text: plain.subarray(0, -1).toString(), delimiter: plain.at(-1) }
}

describe('encryptPush', () => {
  it('makes a message that only the phone can read', () => {
    const phone = createECDH('prime256v1')
    phone.generateKeys()
    const auth = randomBytes(16)
    const body = encryptPush(Buffer.from('{"title":"Lumi","body":"Your download is done!"}'), { p256dh: phone.getPublicKey().toString('base64url'), auth: auth.toString('base64url') })

    expect(decryptAsPhone(body, phone, auth)).toEqual({ recordSize: 4096, text: '{"title":"Lumi","body":"Your download is done!"}', delimiter: 2 })
  })
})

describe('vapidAuthorization', () => {
  it('signs a token for the push service', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
    const header = vapidAuthorization('https://push.example.com/send/abc', pem, new Date('2026-01-01T00:00:00Z'))

    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!
    const [head, claims, signature] = token.split('.')
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({ aud: 'https://push.example.com', exp: 1767268800, sub: 'mailto:owner@example.com' })
    expect(verify('sha256', Buffer.from(`${head}.${claims}`), { key: createPublicKey(privateKey), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true)
    expect(Buffer.from(key, 'base64url')).toHaveLength(65)
  })
})
