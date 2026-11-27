import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronGameBuddy, electronSmartSpot } from '../../../../shared/eventa'

/**
 * FAIRY: game buddy mode and smart spot. The main process does both (see `src/main/services/fairy/game-buddy` and
 * `src/main/services/fairy/smart-spot`).
 */

export const GAME_BUDDY_TOOL_NAME = 'game_buddy'
export const SMART_SPOT_TOOL_NAME = 'smart_spot'

const context = () => createContext(window.electron.ipcRenderer).context

const tools: Promise<Tool>[] = [
  tool({
    name: GAME_BUDDY_TOOL_NAME,
    description: [
      'Game buddy mode: during the owner\'s League of Legends matches you react in your bubble to their kills, deaths, objectives, and the result, and you comment out loud on big moments.',
      'Turn it or only the spoken comments on or off when the owner asks. Without input it tells whether it is on and whether a match runs.',
    ].join(' '),
    execute: async (input: { on?: boolean, comments?: boolean }) => {
      const result = await defineInvoke(context(), electronGameBuddy)({ enabled: input.on, comments: input.comments })
      return `Game buddy mode is ${result.enabled ? 'on' : 'off'}. Spoken comments on big moments are ${result.comments ? 'on' : 'off'}.${result.inMatch ? ' A League match runs now.' : ''}`
    },
    parameters: z.object({
      on: z.boolean().optional().describe('true turns game buddy mode on, false turns it off.'),
      comments: z.boolean().optional().describe('true lets you comment out loud on big moments, false keeps you to bubble lines.'),
    }),
  }),
  tool({
    name: SMART_SPOT_TOOL_NAME,
    description: [
      'Smart spot: while a game or another app fills the screen, you move off its menus, action bars, and minimap, and you go back afterwards.',
      'When the owner drags you during an app, you keep that spot for that app. Turn it on or off, or forget the picked spots, when the owner asks.',
    ].join(' '),
    execute: async (input: { on?: boolean, forget_spots?: boolean }) => {
      const result = await defineInvoke(context(), electronSmartSpot)({ enabled: input.on, forget: input.forget_spots })
      return `Smart spot is ${result.enabled ? 'on' : 'off'}.${result.apps.length ? ` The owner picked your spot for: ${result.apps.join(', ')}.` : ' No picked spots.'}`
    },
    parameters: z.object({
      on: z.boolean().optional().describe('true turns smart spot on, false turns it off.'),
      forget_spots: z.boolean().optional().describe('true forgets every spot the owner picked, so you find free spots yourself again.'),
    }),
  }),
]

export const gameBuddyTools = async () => Promise.all(tools)
