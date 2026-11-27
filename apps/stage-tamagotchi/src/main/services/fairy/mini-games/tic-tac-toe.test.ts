import type { Cell } from './tic-tac-toe'

import { describe, expect, it } from 'vitest'

import { herMove, winnerOf } from './tic-tac-toe'

const never = () => 0.99

function board(text: string): Cell[] {
  return [...text].map(char => (char === 'X' || char === 'O' ? char : ''))
}

describe('winnerOf', () => {
  it('finds rows, columns, diagonals, and draws', () => {
    expect(winnerOf(board('XXX......'))).toBe('X')
    expect(winnerOf(board('O..O..O..'))).toBe('O')
    expect(winnerOf(board('X...X...X'))).toBe('X')
    expect(winnerOf(board('XOXXOOOXX'))).toBe('draw')
    expect(winnerOf(board('X........'))).toBeUndefined()
  })
})

describe('herMove', () => {
  it('wins when she can', () => {
    expect(herMove(board('OO.XX....'), 0, never)).toBe(2)
  })

  it('blocks the owner', () => {
    expect(herMove(board('XX..O....'), 0, never)).toBe(2)
  })

  it('makes a silly move sometimes, but always on a free cell', () => {
    const silly = herMove(board('XX..O....'), 1, () => 0.5)
    expect(board('XX..O....')[silly]).toBe('')
  })
})
