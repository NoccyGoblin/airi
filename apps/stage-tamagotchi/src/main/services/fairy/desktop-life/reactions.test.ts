import { describe, expect, it, vi } from 'vitest'

import { pickLine } from './reactions'

vi.mock('../memory-files', () => ({ FAIRY_DATA_DIR: '/home/user/fairy-data' }))

describe('pickLine', () => {
  const reactions = { thrown: ['a', 'b'], bounce: [], landed: ['c'], sleep: [], wake: [], dance: [], prankHide: [], prankTug: [], prankPopup: [], prankDoodle: [], prankNote: [] }

  it('picks a line of the kind', () => {
    expect(pickLine(reactions, 'thrown', () => 0.6)).toBe('b')
  })

  it('stays quiet for an empty kind', () => {
    expect(pickLine(reactions, 'bounce')).toBeUndefined()
  })
})
