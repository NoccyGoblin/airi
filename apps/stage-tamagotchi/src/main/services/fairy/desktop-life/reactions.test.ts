import { describe, expect, it, vi } from 'vitest'

import { pickLine, reactionsFileFor } from './reactions'

vi.mock('../memory-files', () => ({ FAIRY_DATA_DIR: '/home/user/fairy-data' }))

describe('pickLine', () => {
  const reactions = { thrown: ['a', 'b'], bounce: [], landed: ['c'], sleep: [], wake: [], dance: [], prankHide: [], prankTug: [], prankPopup: [], prankDoodle: [], prankNote: [], gameStart: [], gameKill: [], gameDeath: [], gameMultikill: [], gameFirstBlood: [], gameAce: [], gameEnemyAce: [], gameObjective: [], gameEnemyObjective: [], gameWin: [], gameLose: [] }

  it('picks a line of the kind', () => {
    expect(pickLine(reactions, 'thrown', () => 0.6)).toBe('b')
  })

  it('stays quiet for an empty kind', () => {
    expect(pickLine(reactions, 'bounce')).toBeUndefined()
  })
})

describe('reactionsFileFor', () => {
  it('names the file after the character', () => {
    expect(reactionsFileFor('Lumi')).toBe('lumi.json')
    expect(reactionsFileFor('Mr. Sparkles ✨')).toBe('mr-sparkles.json')
    expect(reactionsFileFor('')).toBe('default.json')
  })
})
