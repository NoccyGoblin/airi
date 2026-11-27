<script setup lang="ts">
import type { BodyState } from './sprite-state'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { useLive2dParams } from '@proj-airi/stage-ui-live2d/stores/model-parameters'
import { getSpeechBusContext, speechOutputLevel } from '@proj-airi/stage-ui/services/speech/bus'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { electronAvatarImages, electronAvatarImagesChanged, electronAvatarState } from '../../../shared/eventa'
import { emotionOfMotion, spriteFor } from './sprite-state'

/**
 * FAIRY: the character as a sprite avatar, like a PNGtuber. It shows one image of `fairy-data/avatar` for her
 * state: the desktop states (thrown, sleeping, dancing, mischief), the emotion of her reply, thinking, talking, and
 * blinking. Soft CSS motion adds life, such as a float, a talk bounce, and a dance sway.
 */

/** Her voice is loud enough for an open mouth above this level. */
const MOUTH_LEVEL = 0.06
/** An emotion of a reply shows this long. */
const EMOTION_MS = 4_000
const LANDED_MS = 1_400
const MISCHIEF_MS = 3_000
const BLINK_MS = 140

const context = createContext(window.electron.ipcRenderer).context
const loadImages = defineInvoke(context, electronAvatarImages)
const chat = useChatStore()
const live2d = useLive2dParams()

const images = shallowRef<Record<string, string>>({})
const available = computed(() => new Set(Object.keys(images.value)))
const body = ref<BodyState>()
const emotion = ref<string>()
const level = ref(0)
const blinking = ref(false)

const mouthOpen = computed(() => level.value > MOUTH_LEVEL)
const shown = computed(() => spriteFor({ body: body.value, emotion: emotion.value, thinking: chat.sending && !mouthOpen.value, mouthOpen: mouthOpen.value, blinking: blinking.value }, available.value))
const motion = computed(() => body.value ?? (mouthOpen.value ? 'talking' : 'floating'))

async function refresh() {
  try {
    images.value = (await loadImages()).images
  }
  catch (error) {
    console.warn('[sprite-avatar] could not load images', errorMessageFrom(error))
  }
}

const timers = new Set<ReturnType<typeof setTimeout>>()
function later(ms: number, run: () => void) {
  const timer = setTimeout(() => {
    timers.delete(timer)
    run()
  }, ms)
  timers.add(timer)
}

// Desktop states. Short ones end by themselves.
const stopState = context.on(electronAvatarState, (event) => {
  const state = event.body?.state
  if (state === 'thrown' || state === 'sleeping' || state === 'dancing')
    body.value = state
  else if (state === 'landed' || state === 'mischief')
    body.value = state
  else
    body.value = undefined
  if (state === 'landed')
    later(LANDED_MS, () => body.value === 'landed' && (body.value = undefined))
  if (state === 'mischief')
    later(MISCHIEF_MS, () => body.value === 'mischief' && (body.value = undefined))
  if (state === 'awake') {
    emotion.value = 'happy'
    later(EMOTION_MS, () => emotion.value === 'happy' && (emotion.value = undefined))
  }
})
const stopImages = context.on(electronAvatarImagesChanged, () => void refresh())

// The stage sets a motion group for the emotion of each reply. The sprite shows it for a while.
const stopEmotion = watch(() => live2d.currentMotion?.group, (group) => {
  const next = emotionOfMotion(group)
  if (!next)
    return
  emotion.value = next
  later(EMOTION_MS, () => emotion.value === next && (emotion.value = undefined))
})

const stopLevel = getSpeechBusContext().on(speechOutputLevel, ({ body: message }) => {
  level.value = message?.level ?? 0
})

let blinkTimer: ReturnType<typeof setTimeout> | undefined
function scheduleBlink() {
  blinkTimer = setTimeout(() => {
    blinking.value = true
    setTimeout(() => {
      blinking.value = false
    }, BLINK_MS)
    scheduleBlink()
  }, 2500 + Math.random() * 3500)
}

onMounted(() => {
  void refresh()
  scheduleBlink()
})
onBeforeUnmount(() => {
  stopState()
  stopImages()
  stopEmotion()
  stopLevel()
  clearTimeout(blinkTimer)
  timers.forEach(clearTimeout)
})
</script>

<template>
  <div class="sprite-avatar" :class="`is-${motion}`">
    <img
      v-if="images[shown] ?? images.idle"
      class="sprite-image"
      :src="images[shown] ?? images.idle"
      :style="{ '--talk': mouthOpen ? Math.min(1, level * 4) : 0 }"
      draggable="false"
      alt=""
      v-bind="$attrs"
    >
  </div>
</template>

<style scoped>
.sprite-avatar {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  pointer-events: none;
}

.sprite-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  pointer-events: auto;
  transform-origin: 50% 100%;
  user-select: none;
}

.is-floating .sprite-image {
  animation: float 3.2s ease-in-out infinite;
}

.is-talking .sprite-image {
  transform: translateY(calc(var(--talk) * -4px)) scale(calc(1 + var(--talk) * 0.03));
}

.is-dancing .sprite-image {
  animation: dance 0.62s ease-in-out infinite alternate;
}

.is-sleeping .sprite-image {
  animation: breathe 3.8s ease-in-out infinite;
}

.is-thrown .sprite-image {
  animation: spin 0.6s linear infinite;
  transform-origin: 50% 50%;
}

.is-landed .sprite-image {
  animation: squash 0.5s ease-out;
}

.is-mischief .sprite-image {
  animation: giggle 0.35s ease-in-out 4;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

@keyframes dance {
  from { transform: rotate(-6deg) translateY(0); }
  to { transform: rotate(6deg) translateY(-8px); }
}

@keyframes breathe {
  0%, 100% { transform: scale(1, 1); }
  50% { transform: scale(1.02, 0.98); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes squash {
  0% { transform: scale(1.15, 0.8); }
  60% { transform: scale(0.95, 1.05); }
  100% { transform: scale(1, 1); }
}

@keyframes giggle {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-4deg); }
  75% { transform: rotate(4deg); }
}
</style>
