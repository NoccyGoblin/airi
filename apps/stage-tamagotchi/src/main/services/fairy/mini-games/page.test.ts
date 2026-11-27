import { describe, expect, it } from 'vitest'

import { gamePage, rpsOutcome } from './page'

describe('rpsOutcome', () => {
  it('knows who wins a round', () => {
    expect(rpsOutcome('rock', 'scissors')).toBe('win')
    expect(rpsOutcome('rock', 'paper')).toBe('loss')
    expect(rpsOutcome('paper', 'paper')).toBe('tie')
  })
})

describe('gamePage', () => {
  it('names the character without markup', () => {
    const page = gamePage('tic-tac-toe', 'Lu<b>mi</b>')
    expect(page).toContain('Tic-tac-toe with Lubmi/b')
    expect(page).not.toContain('<b>mi')
  })
})
