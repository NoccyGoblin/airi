import { describe, expect, it } from 'vitest'

import { describeKeyCombination, parseKeyCombination } from './keys'

describe('parseKeyCombination', () => {
  it('reads modifiers and a key, with aliases and any case', () => {
    expect(parseKeyCombination('ctrl+shift+t')).toEqual({ modifiers: ['Ctrl', 'Shift'], key: 'T' })
    expect(parseKeyCombination('Control + Tab')).toEqual({ modifiers: ['Ctrl'], key: 'Tab' })
    expect(parseKeyCombination('win+d')).toEqual({ modifiers: ['Meta'], key: 'D' })
    expect(parseKeyCombination('esc')).toEqual({ modifiers: [], key: 'Escape' })
    expect(parseKeyCombination('alt+tab')).toEqual({ modifiers: ['Alt'], key: 'Tab' })
    expect(parseKeyCombination('F5')).toEqual({ modifiers: [], key: 'F5' })
  })

  it('reads a lone modifier as the key, for example the Windows key', () => {
    expect(parseKeyCombination('win')).toEqual({ modifiers: [], key: 'Meta' })
  })

  it('rejects unknown keys and two main keys', () => {
    expect(() => parseKeyCombination('ctrl+banana')).toThrow('Unknown key')
    expect(() => parseKeyCombination('a+b')).toThrow('more than one main key')
    expect(() => parseKeyCombination('')).toThrow('No keys')
  })

  it('blocks combinations that close or delete without a way back', () => {
    expect(() => parseKeyCombination('alt+f4')).toThrow('blocked')
    expect(() => parseKeyCombination('shift+del')).toThrow('blocked')
  })
})

describe('describeKeyCombination', () => {
  it('writes the modifiers in a fixed order', () => {
    expect(describeKeyCombination({ modifiers: ['Shift', 'Ctrl'], key: 'T' })).toBe('Ctrl+Shift+T')
  })
})
