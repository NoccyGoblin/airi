import { describe, expect, it } from 'vitest'

import { ownerNotesText } from './mid-job'

describe('ownerNotesText', () => {
  it('adds nothing without messages', () => {
    expect(ownerNotesText([])).toBe('')
  })

  it('quotes each message of the owner', () => {
    const text = ownerNotesText(['no, the other one', 'and make it louder'])
    expect(text).toContain('"no, the other one" and "and make it louder"')
    expect(text).toContain('while you were working')
  })
})
