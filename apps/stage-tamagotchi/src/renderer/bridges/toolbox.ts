import type { createContext } from '@moeru/eventa/adapters/electron/renderer'
import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { watch } from 'vue'

import { electronActivityStatus } from '../../shared/eventa'
import { activityLine } from '../stores/tools/builtin/activity-status'
import { closeToolbox, toolsForStep } from '../stores/tools/builtin/toolbox'

/**
 * FAIRY: sends only the opened tool groups to the model, shows each tool call in the bubble next to the character,
 * and closes the toolbox and the bubble when a message ends. Only the main window runs turns, so only it sets this up.
 */
export function setupToolboxBridge(context: ReturnType<typeof createContext>['context']) {
  const chat = useChatStore()
  const setStatus = defineInvoke(context, electronActivityStatus)
  const status = (text: string | null) => void setStatus({ text }).catch(error => console.warn('[activity] failed', errorMessageFrom(error)))

  /** Shows the call in the bubble before the tool runs. */
  const withActivity = (candidate: Tool): Tool => ({
    ...candidate,
    execute: async (input, options) => {
      const line = activityLine(candidate.function.name, input)
      if (line)
        status(line)
      return candidate.execute(input, options)
    },
  })

  chat.setStepToolFilter((_sessionId, tools) => toolsForStep(tools).map(withActivity))
  const stop = watch(() => chat.sending, (sending) => {
    if (sending)
      return
    closeToolbox()
    status(null)
  })
  return () => {
    stop()
    chat.setStepToolFilter(undefined)
    status(null)
  }
}
