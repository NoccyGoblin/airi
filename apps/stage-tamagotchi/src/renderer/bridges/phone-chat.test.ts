import { describe, expect, it } from 'vitest'

import { pcm16ToBlock, PHONE_SAMPLE_RATE } from './phone-chat'

describe('pcm16ToBlock', () => {
  it('reads little-endian 16-bit samples as one mono block', () => {
    // Samples: 0, 32767, -32768, 16384
    const bytes = new Uint8Array([0x00, 0x00, 0xFF, 0x7F, 0x00, 0x80, 0x00, 0x40])
    const block = pcm16ToBlock(btoa(String.fromCharCode(...bytes)))

    expect(block.sampleRate).toBe(PHONE_SAMPLE_RATE)
    expect(block.range).toEqual({ sourceId: 'phone', startFrame: 0, endFrame: 4 })
    expect(block.channels).toHaveLength(1)
    expect([...block.channels[0]]).toEqual([0, 32767 / 32768, -1, 0.5])
  })
})
