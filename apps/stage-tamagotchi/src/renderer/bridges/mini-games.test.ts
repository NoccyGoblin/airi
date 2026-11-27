import { describe, expect, it } from 'vitest'

import { gameOverNotice } from './mini-games'

describe('gameOverNotice', () => {
  it('says by name who won, so she cannot read it the wrong way round', () => {
    const won = gameOverNotice({ game: 'rock-paper-scissors', result: 'won', score: { her: 2, owner: 0 } }, 'Lumi')
    expect(won).toContain('Lumi (you) WON and the owner lost')
    expect(won).toContain('Final score: Lumi (you) 2, the owner 0')
    expect(gameOverNotice({ game: 'tic-tac-toe', result: 'lost' }, 'Lumi')).toContain('The owner WON and Lumi (you) lost')
    expect(gameOverNotice({ game: 'tic-tac-toe', result: 'draw' }, 'Lumi')).toContain('nobody won')
  })
})
