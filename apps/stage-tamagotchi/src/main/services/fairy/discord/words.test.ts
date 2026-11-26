import { describe, expect, it } from 'vitest'

import { callCommand, callsName, isNoise, nameSpellings } from './words'

describe('callsName', () => {
  const names = nameSpellings('Lumi')

  it('finds the name and the spellings of speech recognition', () => {
    expect(callsName('Hey Lumi, how are you?', names)).toBe(true)
    expect(callsName('loomy what do you think', names)).toBe(true)
    expect(callsName('LUMIE!', names)).toBe(true)
  })

  it('does not match inside other words', () => {
    expect(callsName('the illumination is nice', names)).toBe(false)
    expect(callsName('we talked about lumber', names)).toBe(false)
  })

  it('uses extra spellings from the settings', () => {
    expect(callsName('hey noctis', nameSpellings('Nyx', ['Noctis']))).toBe(true)
  })
})

describe('callCommand', () => {
  it('reads join and leave', () => {
    expect(callCommand('Lumi, join the call')).toBe('join')
    expect(callCommand('lumi join vc')).toBe('join')
    expect(callCommand('Lumi leave the call please')).toBe('leave')
    expect(callCommand('lumi disconnect')).toBe('leave')
  })

  it('finds no command in normal talk', () => {
    expect(callCommand('Lumi, what is the weather?')).toBeUndefined()
  })
})

describe('isNoise', () => {
  it('drops what Whisper writes for silence', () => {
    expect(isNoise(' you')).toBe(true)
    expect(isNoise('Thank you.')).toBe(true)
    expect(isNoise('Lumi, you there?')).toBe(false)
  })
})
