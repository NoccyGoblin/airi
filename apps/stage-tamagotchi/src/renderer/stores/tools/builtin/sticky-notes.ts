import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronStickyNote } from '../../../../shared/eventa'

/** FAIRY: sticky notes on the owner's screen. The main process shows them (see `src/main/services/fairy/sticky-notes`). */

export const STICKY_NOTE_TOOL_NAME = 'sticky_note'

const tools: Promise<Tool>[] = [
  tool({
    name: STICKY_NOTE_TOOL_NAME,
    description: [
      'Put a small sticky note on the owner\'s screen, for example "Drink water!" or a short list. It stays on top until the owner closes it with its ×, even after a restart.',
      'Keep it short. Use it when the owner asks for a note, or for a reminder they want to see, not only hear.',
    ].join(' '),
    execute: async (input: { text: string }) => {
      const cards = useAiriCardStore()
      const result = await defineInvoke(createContext(window.electron.ipcRenderer).context, electronStickyNote)({ text: input.text, by: cards.activeCard?.name ?? '' })
      return `Put the note on the screen. There ${result.count === 1 ? 'is 1 note' : `are ${result.count} notes`} now.`
    },
    parameters: z.object({ text: z.string().max(300).describe('The note text. A few words or a short list.') }),
  }),
]

export const stickyNoteTools = async () => Promise.all(tools)
