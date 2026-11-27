import type { createContext } from '@moeru/eventa/adapters/electron/renderer'

import type { AvatarState } from '../../shared/eventa'

import { useLive2dParams } from '@proj-airi/stage-ui-live2d/stores/model-parameters'
import { EmotionAwkwardMotionName, EmotionHappyMotionName, EmotionNeutralMotionName, EmotionSurpriseMotionName } from '@proj-airi/stage-ui/constants/emotions'

import { electronAvatarState } from '../../shared/eventa'

type RendererContext = ReturnType<typeof createContext>['context']

/**
 * The motion that the current model plays for each desktop state. A model without such motions keeps its idle
 * motion. A future model with its own animations, such as thrown or sleeping, maps the states here.
 */
export const AVATAR_STATE_MOTIONS: Record<AvatarState, string> = {
  thrown: EmotionSurpriseMotionName,
  landed: EmotionAwkwardMotionName,
  sleeping: EmotionNeutralMotionName,
  awake: EmotionHappyMotionName,
  dancing: EmotionHappyMotionName,
  still: EmotionNeutralMotionName,
  mischief: EmotionHappyMotionName,
}

/** FAIRY: acts out what happens to the character on the desktop. Only the main window shows her model. */
export function setupAvatarStateBridge(context: RendererContext) {
  const live2d = useLive2dParams()
  return context.on(electronAvatarState, (event) => {
    const state = event.body?.state
    if (state)
      live2d.currentMotion = { group: AVATAR_STATE_MOTIONS[state] }
  })
}
