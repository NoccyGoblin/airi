import { describe, expect, it } from 'vitest'

import { isSafeId, parseMemory, serializeMemory, slugify, uniqueId } from './memory-files-format'

describe('memory file format', () => {
  it('makes readable, Windows-safe file names', () => {
    expect(slugify('Main champion')).toBe('main-champion')
    expect(slugify('Favourite food: crème brûlée!')).toBe('favourite-food-creme-brulee')
    expect(slugify('???')).toBe('memory')
  })

  it('numbers a second file with the same title', () => {
    expect(uniqueId('Main champion', new Set(['main-champion']))).toBe('main-champion-2')
    expect(uniqueId('Main champion', new Set(['main-champion', 'main-champion-2']))).toBe('main-champion-3')
  })

  it('writes and reads back the same memory', () => {
    const text = serializeMemory({ description: 'Main champion', body: 'Plays Ahri mid.\nRanked in the evening.' })
    expect(text).toBe('# Main champion\n\nPlays Ahri mid.\nRanked in the evening.\n')
    expect(parseMemory('main-champion', text)).toEqual({ id: 'main-champion', description: 'Main champion', body: 'Plays Ahri mid.\nRanked in the evening.' })
  })

  it('reads a file that the user wrote in Notepad without a title', () => {
    expect(parseMemory('pet-cat', '\uFEFFHas a cat named Mochi.\r\n')).toEqual({ id: 'pet-cat', description: 'pet cat', body: 'Has a cat named Mochi.' })
  })

  it('refuses ids that could leave the memory folder', () => {
    expect(isSafeId('main-champion')).toBe(true)
    expect(isSafeId('../secrets')).toBe(false)
    expect(isSafeId('C:\\Windows')).toBe(false)
  })
})
