import { describe, expect, it, vi } from 'vitest'

import { plainText, saysYes, textMatches } from './watch'

vi.mock('./pc-actions', () => ({ askAboutScreen: vi.fn(), readScreenText: vi.fn() }))

describe('textMatches', () => {
  const screen = 'Downloads\nsetup.exe — Download complete!\n12 MB'

  it('finds the words despite case and punctuation', () => {
    expect(textMatches(screen, 'download COMPLETE')).toBe(true)
    expect(textMatches(screen, 'Match found')).toBe(false)
  })

  it('does not match inside another word', () => {
    expect(textMatches('Downloading 45%', 'download')).toBe(false)
  })

  it('waits until a text goes away', () => {
    expect(textMatches('Downloading 45%', 'Downloading', true)).toBe(false)
    expect(textMatches('All done', 'Downloading', true)).toBe(true)
  })
})

describe('plainText', () => {
  it('keeps letters of other languages', () => {
    expect(plainText('Café — Ünïcode!')).toBe('cafe unicode')
  })
})

describe('saysYes', () => {
  it('reads the first word of a look answer', () => {
    expect(saysYes('YES, the bar is red and short.')).toBe(true)
    expect(saysYes('No. It is still full.')).toBe(false)
    expect(saysYes('"Yes" - the queue popped')).toBe(true)
  })
})
