import { describe, expect, it } from 'vitest'

import { clickScript, screenPointOf, scrollScript } from './mouse'

describe('screenPointOf', () => {
  it('scales a screenshot point to the physical display', () => {
    expect(screenPointOf({ x: 800, y: 450 }, { width: 1600, height: 900 }, { x: 0, y: 0, width: 3840, height: 2160 })).toEqual({ x: 1920, y: 1080 })
  })

  it('adds the position of a second display', () => {
    expect(screenPointOf({ x: 0, y: 0 }, { width: 1600, height: 900 }, { x: 2560, y: -200, width: 1920, height: 1080 })).toEqual({ x: 2560, y: -200 })
  })

  it('rejects a point outside the screenshot', () => {
    expect(() => screenPointOf({ x: 1700, y: 10 }, { width: 1600, height: 900 }, { x: 0, y: 0, width: 1920, height: 1080 })).toThrow('outside')
  })
})

describe('mouse scripts', () => {
  it('moves the pointer and clicks once or twice', () => {
    const single = clickScript({ x: 10.4, y: 20.6 }, 'left', false)
    expect(single).toContain('SetCursorPos(10, 21)')
    expect(single.match(/mouse_event\(2,/g)).toHaveLength(1)
    expect(clickScript({ x: 1, y: 1 }, 'left', true).match(/mouse_event\(2,/g)).toHaveLength(2)
    expect(clickScript({ x: 1, y: 1 }, 'right', false)).toContain('mouse_event(8,')
  })

  it('turns the wheel by notches', () => {
    expect(scrollScript(-3)).toContain('mouse_event(2048, 0, 0, -360, 0)')
  })
})
