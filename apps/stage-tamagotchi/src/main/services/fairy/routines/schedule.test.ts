import { describe, expect, it } from 'vitest'

import { isDue, nextRun, parseTime } from './schedule'

// 2026-11-26 is a Thursday.
const thursday = (time: string) => new Date(`2026-11-26T${time}:00`)

describe('parseTime', () => {
  it('reads short and long times and rejects others', () => {
    expect(parseTime('9:05')).toEqual({ hours: 9, minutes: 5 })
    expect(parseTime('21:30')).toEqual({ hours: 21, minutes: 30 })
    expect(() => parseTime('25:00')).toThrow('not a time')
    expect(() => parseTime('9am')).toThrow('not a time')
  })
})

describe('isDue', () => {
  const daily = { time: '09:00', days: [] }

  it('runs once after its time on its day', () => {
    expect(isDue(daily, thursday('08:59'), undefined)).toBe(false)
    expect(isDue(daily, thursday('09:00'), undefined)).toBe(true)
    expect(isDue(daily, thursday('09:30'), thursday('09:00'))).toBe(false)
  })

  it('runs again on the next day', () => {
    expect(isDue(daily, new Date('2026-11-27T09:01:00'), thursday('09:00'))).toBe(true)
  })

  it('catches up a missed run for three hours, not longer', () => {
    expect(isDue(daily, thursday('11:59'), undefined)).toBe(true)
    expect(isDue(daily, thursday('12:01'), undefined)).toBe(false)
  })

  it('runs only on its days', () => {
    expect(isDue({ time: '09:00', days: ['mon', 'tue'] }, thursday('09:05'), undefined)).toBe(false)
    expect(isDue({ time: '09:00', days: ['thu'] }, thursday('09:05'), undefined)).toBe(true)
  })

  it('runs after a time change later the same day', () => {
    expect(isDue({ time: '18:00', days: [] }, thursday('18:01'), thursday('09:00'))).toBe(true)
  })
})

describe('nextRun', () => {
  it('finds the next time today or on a later day', () => {
    expect(nextRun({ time: '18:00', days: [] }, thursday('10:00'))).toBe('2026-11-26 18:00')
    expect(nextRun({ time: '09:00', days: [] }, thursday('10:00'))).toBe('2026-11-27 09:00')
    expect(nextRun({ time: '09:00', days: ['mon'] }, thursday('10:00'))).toBe('2026-11-30 09:00')
  })
})
