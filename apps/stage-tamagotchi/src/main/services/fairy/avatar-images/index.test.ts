import { describe, expect, it, vi } from 'vitest'

import { stateOfFile } from '.'
import { PLACEHOLDERS } from './placeholders'

vi.mock('../memory-files', () => ({ FAIRY_DATA_DIR: '/home/user/fairy-data' }))

describe('stateOfFile', () => {
  it('reads the state from an image name', () => {
    expect(stateOfFile('Idle.PNG')).toBe('idle')
    expect(stateOfFile('happy-talk.gif')).toBe('happy-talk')
    expect(stateOfFile('notes.txt')).toBeUndefined()
  })
})

describe('placeholder images', () => {
  it('cover talking, blinking, and every desktop state', () => {
    for (const state of ['idle', 'talk', 'blink', 'thrown', 'landed', 'sleeping', 'dancing', 'mischief'])
      expect(PLACEHOLDERS[state]).toContain('<svg')
  })
})

describe('isOurPlaceholder', () => {
  it('knows our placeholders and leaves the owner\'s images alone', async () => {
    const { isOurPlaceholder } = await import('.')
    expect(isOurPlaceholder(PLACEHOLDERS.idle)).toBe(true)
    expect(isOurPlaceholder('<svg viewBox="0 0 200 220"><path fill="#ffb3d9"/></svg>')).toBe(true)
    expect(isOurPlaceholder('<svg viewBox="0 0 512 512"><circle r="9"/></svg>')).toBe(false)
  })
})
