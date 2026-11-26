import { voiceMoodMarker } from '@proj-airi/core-agent'
import { describe, expect, it, vi } from 'vitest'

import { orpheusPrompt, snacLayers, toWav } from './orpheus'

// The real module reads the Electron app path.
vi.mock('../memory-files', () => ({ FAIRY_DATA_DIR: '/home/user/fairy-data' }))

describe('orpheusPrompt', () => {
  it('wraps the text for the voice and turns mood markers into Orpheus tags', () => {
    expect(orpheusPrompt(`No way ${voiceMoodMarker('laugh')} really?`, 'tara'))
      .toBe('<custom_token_3><|begin_of_text|>tara: No way <laugh> really?<|eot_id|><custom_token_4><custom_token_5><custom_token_1>')
  })
})

describe('snacLayers', () => {
  it('splits each 7-token frame into the three SNAC layers', () => {
    // Codes 1..7, each offset by 10 and by its position in the frame.
    const frame = [1, 2, 3, 4, 5, 6, 7].map((code, index) => `<custom_token_${code + 10 + index * 4096}>`).join('')
    expect(snacLayers(frame)).toEqual([[1], [2, 5], [3, 4, 6, 7]])
  })

  it('drops an incomplete last frame and tokens out of range', () => {
    const frame = [1, 2, 3, 4, 5, 6, 7].map((code, index) => `<custom_token_${code + 10 + index * 4096}>`).join('')
    expect(snacLayers(`<custom_token_3>${frame}<custom_token_20>`)).toEqual([[1], [2, 5], [3, 4, 6, 7]])
  })
})

describe('toWav', () => {
  it('writes a 16-bit mono WAV header and clamps the samples', () => {
    const view = new DataView(toWav(new Float32Array([0, 2, -2]), 24_000))
    expect(view.byteLength).toBe(44 + 6)
    expect(view.getUint32(24, true)).toBe(24_000)
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([0, 32767, -32767])
  })
})
