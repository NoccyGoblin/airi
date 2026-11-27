import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { GameName } from './page'
import type { Cell } from './tic-tac-toe'

import { setTimeout as sleep } from 'node:timers/promises'

import { defineInvokeHandler } from '@moeru/eventa'
import { BrowserWindow, screen } from 'electron'

import { electronGameOver, electronPlayGame } from '../../../../shared/eventa'
import { bubblePlace } from '../activity-bubble/place'
import { gamePage, rpsOutcome } from './page'
import { emptyBoard, herMove, winnerOf } from './tic-tac-toe'

/**
 * FAIRY: small games with the character in a window next to her. The game runs here and in its page, so a move
 * costs nothing. Only the end of a game goes to her chat, so she can react in her own words.
 */

const GAME_SIZE = { width: 320, height: 380 }
const RPS_CHOICES = ['rock', 'paper', 'scissors'] as const
/** A short pause before her move, so she seems to think. */
const THINK_MS = 450

export function createMiniGamesService(params: { context: ReturnType<typeof createContext>['context'] }) {
  let open: BrowserWindow | undefined

  function finish(game: GameName, result: 'won' | 'lost' | 'draw', detail: string) {
    params.context.emit(electronGameOver, { game, result, detail })
  }

  function start(game: GameName, characterName: string, near?: { x: number, y: number, width: number, height: number }) {
    open?.destroy()
    const area = (near ? screen.getDisplayMatching(near) : screen.getPrimaryDisplay()).workArea
    const spot = near ? bubblePlace(near, GAME_SIZE, area) : { x: area.x + (area.width - GAME_SIZE.width) / 2, y: area.y + (area.height - GAME_SIZE.height) / 2 }
    const window = new BrowserWindow({
      ...GAME_SIZE,
      x: Math.round(spot.x),
      y: Math.round(spot.y),
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    })
    open = window
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.on('closed', () => {
      if (open === window)
        open = undefined
    })

    let board: Cell[] = emptyBoard()
    let score = { you: 0, her: 0 }
    const run = (code: string) => window.isDestroyed() ? Promise.resolve() : window.webContents.executeJavaScript(code).catch(() => {})
    const load = () => window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(gamePage(game, characterName))}`)

    // The page says each move of the owner in its title.
    window.on('page-title-updated', (event, title) => {
      event.preventDefault()
      const [kind, value] = title.split(':')
      if (kind === 'again') {
        board = emptyBoard()
        score = { you: 0, her: 0 }
        void load()
        return
      }
      if (kind === 'move' && game === 'tic-tac-toe') {
        const cell = Number(value)
        if (!Number.isInteger(cell) || cell < 0 || cell > 8 || board[cell])
          return
        board[cell] = 'X'
        void (async () => {
          let winner = winnerOf(board)
          if (!winner) {
            await sleep(THINK_MS)
            const hers = herMove(board)
            board[hers] = 'O'
            await run(`window.herMove(${hers})`)
            winner = winnerOf(board)
          }
          if (winner === 'X') {
            await run(`window.gameOver('You won! 🎉')`)
            finish(game, 'lost', 'The owner got three in a row.')
          }
          else if (winner === 'O') {
            await run(`window.gameOver('She won! 😈')`)
            finish(game, 'won', 'You got three in a row.')
          }
          else if (winner === 'draw') {
            await run(`window.gameOver('A draw!')`)
            finish(game, 'draw', 'Nobody got three in a row.')
          }
        })()
        return
      }
      if (kind === 'rps' && game === 'rock-paper-scissors' && RPS_CHOICES.includes(value as typeof RPS_CHOICES[number])) {
        const hers = RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)]
        const outcome = rpsOutcome(value, hers)
        if (outcome === 'win')
          score.you++
        if (outcome === 'loss')
          score.her++
        void (async () => {
          await sleep(THINK_MS)
          await run(`window.herMove(${JSON.stringify(value)}, ${JSON.stringify(hers)}, ${JSON.stringify(outcome)})`)
          if (score.you < 2 && score.her < 2)
            return
          const ownerWon = score.you > score.her
          await run(`window.gameOver(${JSON.stringify(ownerWon ? `You won ${score.you}–${score.her}! 🎉` : `She won ${score.her}–${score.you}! 😈`)})`)
          finish(game, ownerWon ? 'lost' : 'won', `Best of three, ${score.her}–${score.you} for ${ownerWon ? 'the owner' : 'you'}.`)
        })()
      }
    })
    window.once('ready-to-show', () => window.show())
    void load()
  }

  defineInvokeHandler(params.context, electronPlayGame, ({ game, character, near }) => {
    start(game, character || 'AIRI', near)
  })

  return () => {
    open?.destroy()
    open = undefined
  }
}
