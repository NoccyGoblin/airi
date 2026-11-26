import { Buffer } from 'node:buffer'

/**
 * FAIRY: audio between Discord and the local voice. Discord sends and takes 48 kHz stereo 16-bit PCM after Opus
 * decoding. Whisper takes 16 kHz mono. The main window sends her speech as mono 48 kHz PCM.
 */

export const DISCORD_RATE = 48_000
const DISCORD_CHANNELS = 2
const BYTES_PER_FRAME = DISCORD_CHANNELS * 2
export const HEARING_RATE = 16_000

/** The length of Discord PCM in seconds. */
export function discordPcmSeconds(pcm: Uint8Array) {
  return pcm.byteLength / BYTES_PER_FRAME / DISCORD_RATE
}

/**
 * Turns Discord PCM into 16 kHz mono samples for Whisper. Each output sample averages three input frames and both
 * channels, which also filters a little of the noise above 8 kHz.
 */
export function discordPcmToHearing(pcm: Uint8Array): Float32Array {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const frames = Math.floor(pcm.byteLength / BYTES_PER_FRAME)
  const step = DISCORD_RATE / HEARING_RATE
  const samples = new Float32Array(Math.floor(frames / step))
  for (let index = 0; index < samples.length; index++) {
    let sum = 0
    for (let offset = 0; offset < step; offset++) {
      const frame = (index * step + offset) * BYTES_PER_FRAME
      sum += view.getInt16(frame, true) + view.getInt16(frame + 2, true)
    }
    samples[index] = sum / (step * DISCORD_CHANNELS * 32768)
  }
  return samples
}

/** Writes mono samples as a 16-bit PCM WAV file. */
export function monoWav(samples: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true))
  return bytes
}

/** Turns mono 16-bit PCM at 48 kHz into the stereo PCM that Discord plays. Both channels get the same sound. */
export function monoToDiscordPcm(mono: Uint8Array): Buffer {
  const samples = Math.floor(mono.byteLength / 2)
  const source = new DataView(mono.buffer, mono.byteOffset, samples * 2)
  const pcm = Buffer.alloc(samples * BYTES_PER_FRAME)
  for (let index = 0; index < samples; index++) {
    const value = source.getInt16(index * 2, true)
    pcm.writeInt16LE(value, index * BYTES_PER_FRAME)
    pcm.writeInt16LE(value, index * BYTES_PER_FRAME + 2)
  }
  return pcm
}
