import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { useLocalStorage } from '@vueuse/core'
import { watch } from 'vue'

import { electronCharacterSize } from '../../shared/eventa'
import { useAvatarStyle } from '../stores/avatar-style'

/** The window of a full-body sprite: tall and narrow, like the 220 by 440 drawings. */
export const SPRITE_WINDOW = { width: 230, height: 460 }

/**
 * FAIRY: gives the character's window a tall shape for her full-body sprite, and her earlier size back for her
 * Live2D model. Only the main window calls it.
 */
export function useAvatarStyleWindow() {
  const style = useAvatarStyle()
  const live2dSize = useLocalStorage<{ width: number, height: number } | null>('fairy/live2d-window-size', null)
  const resize = defineInvoke(createContext(window.electron.ipcRenderer).context, electronCharacterSize)

  return watch(style, async (next, previous) => {
    if (next === previous)
      return
    try {
      if (next === 'sprite') {
        const before = await resize(SPRITE_WINDOW)
        // A start in sprite mode already has the tall size, so only a real Live2D size is kept.
        if (before.height < SPRITE_WINDOW.height - 10)
          live2dSize.value = before
      }
      else if (live2dSize.value) {
        await resize(live2dSize.value)
      }
    }
    catch (error) {
      console.warn('[avatar-style] could not size the window', errorMessageFrom(error))
    }
  }, { immediate: true })
}
