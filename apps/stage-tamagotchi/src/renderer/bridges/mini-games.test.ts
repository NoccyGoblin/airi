import { describe, expect, it } from 'vitest'

import { gameOverNotice } from './mini-games'

describe('gameOverNotice', () => {
  it('tells her the result from her side', () => {
    expect(gameOverNotice({ game: 'tic-tac-toe', result: 'lost', detail: 'The owner got three in a row.' })).toContain('You lost. The owner got three in a row.')
    expect(gameOverNotice({ game: 'rock-paper-scissors', result: 'won', detail: '' })).toContain('You won')
  })
})
