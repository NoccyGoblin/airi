import { describe, expect, it } from 'vitest'

import { routineNotice } from './routines'

describe('routineNotice', () => {
  it('names the routine and carries the owner\'s words', () => {
    const notice = routineNotice({ name: 'Good morning', time: '08:30', instruction: 'Tell me the weather in Amsterdam.' })
    expect(notice).toContain('Routine "Good morning" (08:30) is due now.')
    expect(notice).toContain('What the owner wants: Tell me the weather in Amsterdam.')
  })
})
