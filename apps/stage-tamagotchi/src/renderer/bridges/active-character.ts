import type { createContext } from '@moeru/eventa/adapters/electron/renderer'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { watch } from 'vue'

import { electronActiveCharacter } from '../../shared/eventa'

type RendererContext = ReturnType<typeof createContext>['context']

/**
 * FAIRY: tells the main process which character is on the stage, so her throw, nap, dance, and prank lines come
 * from her own file. It sends again on each switch.
 */
export function setupActiveCharacterBridge(context: RendererContext) {
  const cards = useAiriCardStore()
  const tell = defineInvoke(context, electronActiveCharacter)
  return watch(
    () => cards.activeCard?.name ?? '',
    name => void tell({ name }).catch(error => console.warn('[active-character] send failed', errorMessageFrom(error))),
    { immediate: true },
  )
}
