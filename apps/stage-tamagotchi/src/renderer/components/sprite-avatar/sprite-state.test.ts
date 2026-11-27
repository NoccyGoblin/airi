import { describe, expect, it } from 'vitest'

import { emotionOfMotion, spriteFor } from './sprite-state'

const calm = { thinking: false, mouthOpen: false, blinking: false }

describe('spriteFor', () => {
  it('starts with two or three drawings', () => {
    const few = new Set(['idle', 'talk', 'blink'])
    expect(spriteFor(calm, few)).toBe('idle')
    expect(spriteFor({ ...calm, mouthOpen: true }, few)).toBe('talk')
    expect(spriteFor({ ...calm, blinking: true }, few)).toBe('blink')
    expect(spriteFor({ ...calm, emotion: 'happy' }, few)).toBe('idle')
    expect(spriteFor({ ...calm, body: 'sleeping' }, few)).toBe('idle')
  })

  it('lets the body win over emotions and keeps a sleeping face shut', () => {
    const many = new Set(['idle', 'talk', 'happy', 'sleeping', 'surprised'])
    expect(spriteFor({ ...calm, body: 'sleeping', emotion: 'happy', mouthOpen: true }, many)).toBe('sleeping')
    expect(spriteFor({ ...calm, body: 'thrown' }, many)).toBe('surprised')
  })

  it('uses a talking or blinking version of an emotion when there is one', () => {
    const set = new Set(['idle', 'talk', 'blink', 'happy', 'happy-talk'])
    expect(spriteFor({ ...calm, emotion: 'happy', mouthOpen: true }, set)).toBe('happy-talk')
    expect(spriteFor({ ...calm, emotion: 'happy', blinking: true }, set)).toBe('happy')
  })

  it('falls back to a similar image', () => {
    expect(spriteFor({ ...calm, emotion: 'angry' }, new Set(['idle', 'sad']))).toBe('sad')
    expect(spriteFor({ ...calm, thinking: true, emotion: 'question' }, new Set(['idle', 'thinking']))).toBe('thinking')
  })
})

describe('emotionOfMotion', () => {
  it('reads the motion group of an emotion', () => {
    expect(emotionOfMotion('Surprise')).toBe('surprised')
    expect(emotionOfMotion('Idle')).toBeUndefined()
  })
})
