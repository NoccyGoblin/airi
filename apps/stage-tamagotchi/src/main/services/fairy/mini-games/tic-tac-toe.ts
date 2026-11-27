/**
 * FAIRY: the character's tic-tac-toe moves. She plays well, but now and then she makes a silly move, so the owner
 * can win. The board is 9 cells, left to right and top to bottom, each 'X' (the owner), 'O' (her), or ''.
 */

export type Cell = 'X' | 'O' | ''

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]

export function winnerOf(board: readonly Cell[]): 'X' | 'O' | 'draw' | undefined {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c])
      return board[a] as 'X' | 'O'
  }
  return board.every(Boolean) ? 'draw' : undefined
}

/** The score of a board for her: positive when she wins, sooner is better. */
function score(board: Cell[], herTurn: boolean, depth: number): number {
  const winner = winnerOf(board)
  if (winner === 'O')
    return 10 - depth
  if (winner === 'X')
    return depth - 10
  if (winner === 'draw')
    return 0
  let best = herTurn ? -Infinity : Infinity
  for (let cell = 0; cell < 9; cell++) {
    if (board[cell])
      continue
    board[cell] = herTurn ? 'O' : 'X'
    const value = score(board, !herTurn, depth + 1)
    board[cell] = ''
    best = herTurn ? Math.max(best, value) : Math.min(best, value)
  }
  return best
}

/**
 * Her next cell. With chance `silly` she takes a random free cell instead of the best one.
 * `random` returns numbers in [0, 1), so tests can pass a fixed sequence.
 */
export function herMove(board: readonly Cell[], silly = 0.25, random: () => number = Math.random): number {
  const free = board.flatMap((cell, index) => cell ? [] : [index])
  if (!free.length)
    throw new Error('The board is full.')
  if (random() < silly)
    return free[Math.floor(random() * free.length)]
  const work = [...board]
  let best = free[0]
  let bestScore = -Infinity
  for (const cell of free) {
    work[cell] = 'O'
    const value = score(work, false, 1)
    work[cell] = ''
    if (value > bestScore) {
      bestScore = value
      best = cell
    }
  }
  return best
}
