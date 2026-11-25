import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/**
 * FAIRY: whether live mode is on. While it is on, the character watches the screen and can start talking by herself.
 *
 * Every window shares the switch through localStorage. Only the main window runs live mode. The switch keeps the time
 * it was turned on, so the main window can turn off a switch from an earlier app run.
 */
export const useLiveModeStore = defineStore('fairy-live-mode', () => {
  const enabledAt = useLocalStorage('fairy/live-mode/enabled-at', 0)
  const enabled = computed(() => enabledAt.value > 0)

  function toggle() {
    enabledAt.value = enabled.value ? 0 : Date.now()
  }

  /** Turns off a switch that was turned on before `startedAt`. */
  function forgetEarlierRun(startedAt: number) {
    if (enabledAt.value > 0 && enabledAt.value < startedAt)
      enabledAt.value = 0
  }

  return { enabled, toggle, forgetEarlierRun }
})
