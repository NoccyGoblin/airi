import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { watch } from 'vue'

import { closeToolbox, toolsForStep } from '../stores/tools/builtin/toolbox'

/**
 * FAIRY: sends only the opened tool groups to the model, and closes the toolbox when a message ends.
 * Only the main window runs turns, so only it sets this up.
 */
export function setupToolboxBridge() {
  const chat = useChatStore()
  chat.setStepToolFilter((_sessionId, tools) => toolsForStep(tools))
  const stop = watch(() => chat.sending, (sending) => {
    if (!sending)
      closeToolbox()
  })
  return () => {
    stop()
    chat.setStepToolFilter(undefined)
  }
}
