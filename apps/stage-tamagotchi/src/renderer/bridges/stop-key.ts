import type { createContext } from '@moeru/eventa/adapters/electron/renderer'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { watch } from 'vue'

import { electronStopKeyArmed, electronStopPressed } from '../../shared/eventa'

type RendererContext = ReturnType<typeof createContext>['context']

/** The cause that a stop by Escape gives the voice interruption. */
export const STOP_KEY_CAUSE = 'owner-stop-key'

/**
 * FAIRY: while the character thinks, works, or talks, Escape stops her. The main process holds the key only then.
 * Only the main window plays her voice and runs her turns, so only it sets this up.
 */
export function setupStopKeyBridge(context: RendererContext) {
  const chat = useChatStore()
  const voice = useVoiceStore()
  const arm = defineInvoke(context, electronStopKeyArmed)

  const stopWatching = watch(
    () => chat.sending || voice.activeTurns.length > 0,
    busy => void arm({ armed: busy }).catch(error => console.warn('[stop-key] arm failed', errorMessageFrom(error))),
    { immediate: true },
  )

  const stopListening = context.on(electronStopPressed, () => {
    void voice.interrupt([...voice.activeTurns], STOP_KEY_CAUSE)
    void chat.cancelPendingSends().catch(error => console.warn('[stop-key] cancel failed', errorMessageFrom(error)))
  })

  return () => {
    stopWatching()
    stopListening()
    void arm({ armed: false }).catch(() => {})
  }
}
