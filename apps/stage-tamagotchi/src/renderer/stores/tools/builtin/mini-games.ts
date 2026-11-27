import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronPlayGame } from '../../../../shared/eventa'

/** FAIRY: mini games with the owner. The main process runs them (see `src/main/services/fairy/mini-games`). */

export const PLAY_GAME_TOOL_NAME = 'play_game'

const tools: Promise<Tool>[] = [
  tool({
    name: PLAY_GAME_TOOL_NAME,
    description: [
      'Open a mini game with the owner in a small window next to you: tic-tac-toe, or rock, paper, scissors (best of three).',
      'The owner plays with the mouse and you play your moves by yourself. When the game ends you hear the result and can react.',
    ].join(' '),
    execute: async (input: { game: 'tic-tac-toe' | 'rock-paper-scissors' }) => {
      const cards = useAiriCardStore()
      await defineInvoke(createContext(window.electron.ipcRenderer).context, electronPlayGame)({
        game: input.game,
        character: cards.activeCard?.name ?? '',
        near: { x: window.screenX, y: window.screenY, width: window.outerWidth, height: window.outerHeight },
      })
      return `Opened ${input.game} next to you. The owner moves first.`
    },
    parameters: z.object({ game: z.enum(['tic-tac-toe', 'rock-paper-scissors']) }),
  }),
]

export const miniGameTools = async () => Promise.all(tools)
