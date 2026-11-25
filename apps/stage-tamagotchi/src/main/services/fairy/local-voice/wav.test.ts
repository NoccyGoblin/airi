import { describe, expect, it } from 'vitest'

import { readWavMono } from './wav'

function wav(samples: number[], options: { rate: number, channels: number }) {
  const data = new DataView(new ArrayBuffer(samples.length * 2))
  samples.forEach((sample, index) => data.setInt16(index * 2, sample, true))
  const header = new DataView(new ArrayBuffer(44))
  const text = (offset: number, value: string) => [...value].forEach((char, index) => header.setUint8(offset + index, char.charCodeAt(0)))
  text(0, 'RIFF')
  header.setUint32(4, 36 + data.byteLength, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  header.setUint32(16, 16, true)
  header.setUint16(20, 1, true)
  header.setUint16(22, options.channels, true)
  header.setUint32(24, options.rate, true)
  header.setUint32(28, options.rate * options.channels * 2, true)
  header.setUint16(32, options.channels * 2, true)
  header.setUint16(34, 16, true)
  text(36, 'data')
  header.setUint32(40, data.byteLength, true)
  const bytes = new Uint8Array(44 + data.byteLength)
  bytes.set(new Uint8Array(header.buffer), 0)
  bytes.set(new Uint8Array(data.buffer), 44)
  return bytes
}

describe('readWavMono', () => {
  it('reads 16-bit mono PCM at the same rate', () => {
    expect([...readWavMono(wav([0, 16384, -32768], { rate: 16_000, channels: 1 }), 16_000)]).toEqual([0, 0.5, -1])
  })

  it('mixes stereo to mono', () => {
    expect([...readWavMono(wav([16384, 0, -16384, -16384], { rate: 16_000, channels: 2 }), 16_000)]).toEqual([0.25, -0.5])
  })

  it('resamples to the target rate', () => {
    expect(readWavMono(wav(Array.from({ length: 480 }).fill(0) as number[], { rate: 48_000, channels: 1 }), 16_000)).toHaveLength(160)
  })

  it('rejects other files', () => {
    expect(() => readWavMono(new Uint8Array(44), 16_000)).toThrow('not a WAV')
  })
})
