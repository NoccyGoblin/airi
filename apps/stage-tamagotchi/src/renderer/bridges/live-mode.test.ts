import { describe, expect, it } from 'vitest'

import { LIVE_MODE_PACE, nextLiveModeStep, screenChanged, withoutImages } from './live-mode'

const minute = 60_000
const now = 100 * minute

describe('nextLiveModeStep', () => {
  it('looks when the chat is quiet and the owner spoke last', () => {
    expect(nextLiveModeStep({ now, messages: [{ id: 'u1', role: 'user', at: now - 2 * minute }], lastLookAt: 0 })).toBe('look')
    expect(nextLiveModeStep({ now, messages: [], lastLookAt: 0 })).toBe('look')
  })

  it('waits while the chat is active or a look was recent', () => {
    expect(nextLiveModeStep({ now, messages: [{ id: 'u1', role: 'user', at: now - 10_000 }], lastLookAt: 0 })).toBe('wait')
    expect(nextLiveModeStep({ now, messages: [], lastLookAt: now - 10_000 })).toBe('wait')
  })

  it('waits for an answer after she talked, then checks in once', () => {
    const her = { id: 'a1', role: 'assistant' as const, at: now - minute }
    expect(nextLiveModeStep({ now, messages: [her], lastLookAt: 0 })).toBe('wait')

    const old = { ...her, at: now - LIVE_MODE_PACE.noAnswer }
    expect(nextLiveModeStep({ now, messages: [old], lastLookAt: 0 })).toBe('check-in')
    expect(nextLiveModeStep({ now, messages: [old], lastLookAt: 0, checkedInFor: 'a1' })).toBe('wait')
  })

  it('looks again after the owner was away for a long time', () => {
    const her = { id: 'a1', role: 'assistant' as const, at: now - LIVE_MODE_PACE.away }
    expect(nextLiveModeStep({ now, messages: [her], lastLookAt: 0, checkedInFor: 'a1' })).toBe('look')
  })
})

describe('screenChanged', () => {
  it('ignores tiny changes and notices big ones', () => {
    const screen = new Uint8Array(100).fill(100)
    expect(screenChanged(undefined, screen)).toBe(true)
    expect(screenChanged(screen, new Uint8Array(100).fill(102))).toBe(false)
    expect(screenChanged(screen, new Uint8Array(100).fill(150))).toBe(true)
  })
})

describe('withoutImages', () => {
  it('replaces screenshot parts with a note and keeps the text', () => {
    const message = {
      id: 'n1',
      role: 'user' as const,
      notice: { source: 'live-mode' },
      content: [{ type: 'text' as const, text: 'Live mode' }, { type: 'image_url' as const, image_url: { url: 'data:image/jpeg;base64,AAAA' } }],
    }
    const result = withoutImages(message as never) as unknown as typeof message
    expect(result.content[0]).toEqual({ type: 'text', text: 'Live mode' })
    expect(result.content[1]).toMatchObject({ type: 'text' })
  })
})
