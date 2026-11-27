import { useLocalStorage } from '@vueuse/core'

/**
 * FAIRY: how the character looks: her Live2D model, or the sprite avatar from `fairy-data/avatar`. The Live2D stage
 * keeps running under the sprite, because her voice plays through it.
 */
export type AvatarStyle = 'live2d' | 'sprite'

export function useAvatarStyle() {
  return useLocalStorage<AvatarStyle>('fairy/avatar-style', 'live2d')
}
