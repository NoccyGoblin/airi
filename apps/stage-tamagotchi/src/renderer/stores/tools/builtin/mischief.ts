import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronMischief } from '../../../../shared/eventa'

/** FAIRY: mischief mode. The main process plays the pranks (see `src/main/services/fairy/mischief`). */

export const MISCHIEF_MODE_TOOL_NAME = 'mischief_mode'

const tools: Promise<Tool>[] = [
  tool({
    name: MISCHIEF_MODE_TOOL_NAME,
    description: [
      'Turn mischief mode on or off, or play one prank right now. In mischief mode you play a small, harmless prank every 10 to 25 minutes while the owner uses the PC:',
      'you hide at the screen edge, tug their mouse pointer a little, show a joke "takeover" popup, doodle on the screen, or leave a sticky note. Never in a fullscreen game.',
      'Use it only when the owner asks for mischief, pranks, or to stop them.',
    ].join(' '),
    execute: async (input: { on: boolean, prank_now: boolean }) => {
      const cards = useAiriCardStore()
      const result = await defineInvoke(createContext(window.electron.ipcRenderer).context, electronMischief)({ enabled: input.on, prankNow: input.prank_now, character: cards.activeCard?.name ?? '' })
      return `Mischief mode is ${result.enabled ? 'on' : 'off'}.${result.played ? ` You just played the ${result.played} prank.` : input.prank_now ? ' No prank right now.' : ''}`
    },
    parameters: z.object({
      on: z.boolean().describe('True to keep pranking now and then, false to stop.'),
      prank_now: z.boolean().describe('True to play one prank right away, for example when the owner says "prank me".'),
    }),
  }),
]

export const mischiefTools = async () => Promise.all(tools)
