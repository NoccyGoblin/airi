import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronPhoneNotify } from '../../../../shared/eventa'

/** FAIRY: a notification on the owner's phone. The main process sends it (see `src/main/services/fairy/phone/push.ts`). */

export const MESSAGE_PHONE_TOOL_NAME = 'message_phone'

const tools: Promise<Tool>[] = [
  tool({
    name: MESSAGE_PHONE_TOOL_NAME,
    description: [
      'Send a short notification to the owner\'s phone, like a text message from you.',
      'Use it when the owner asks you to tell them on their phone, or when a watch, reminder, or routine fires and they asked to hear about it while away from the PC.',
      'Do not use it for normal replies in this chat.',
    ].join(' '),
    execute: async (input: { text: string }) => {
      const name = useAiriCardStore().activeCard?.name || 'Your companion'
      const result = await defineInvoke(createContext(window.electron.ipcRenderer).context, electronPhoneNotify)({ title: name, text: input.text })
      if (!result.phones)
        return 'No phone gets notifications yet. Tell the owner to open the phone page and tap the 🔕 bell once.'
      if (!result.sent)
        return 'The message did not reach the phone. The push service did not take it. Try again later.'
      return 'Sent the message to the owner\'s phone.'
    },
    parameters: z.object({ text: z.string().max(400).describe('The message. One or two short sentences, in your own voice.') }),
  }),
]

export const phoneMessageTools = async () => Promise.all(tools)
