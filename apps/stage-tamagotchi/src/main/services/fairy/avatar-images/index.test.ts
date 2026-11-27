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
