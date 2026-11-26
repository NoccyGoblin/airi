import { describe, expect, it } from 'vitest'

import { readWavMono } from '../local-voice/wav'
import { DISCORD_RATE, discordPcmSeconds, discordPcmToHearing, HEARING_RATE, monoToDiscordPcm, monoWav } from './audio'

/** Discord PCM with the same value in both channels for `frames` frames. */
function discordPcm(frames: number, value: number) {
  const pcm = new Uint8Array(frames * 4)
  const view = new DataView(pcm.buffer)
  for (let frame = 0; frame < frames; frame++) {
    view.setInt16(frame * 4, value, true)
    view.setInt16(frame * 4 + 2, value, true)
  }
  return pcm
}

describe('discord audio', () => {
  it('measures and downsamples Discord PCM for hearing', () => {
    const pcm = discordPcm(DISCORD_RATE, 16384)
    expect(discordPcmSeconds(pcm)).toBe(1)
    const samples = discordPcmToHearing(pcm)
    expect(samples).toHaveLength(HEARING_RATE)
    expect(samples[100]).toBeCloseTo(0.5, 3)
  })

  it('writes a WAV that the WAV reader reads back', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1])
    const back = readWavMono(monoWav(samples, HEARING_RATE), HEARING_RATE)
    expect([...back].map(value => Number(value.toFixed(2)))).toEqual([0, 0.5, -0.5, 1])
  })

  it('copies mono speech into both Discord channels', () => {
    const mono = new Uint8Array(DISCORD_RATE * 2)
    new DataView(mono.buffer).setInt16(200, 1234, true)
    const pcm = monoToDiscordPcm(mono)
    expect(discordPcmSeconds(pcm)).toBe(1)
    expect(pcm.readInt16LE(400)).toBe(1234)
    expect(pcm.readInt16LE(402)).toBe(1234)
  })
})
