import type { Tool } from '@xsai/shared-chat'

import type { AvatarStyle } from '../../avatar-style'

import { tool } from '@xsai/tool'
import { z } from 'zod'

import { useAvatarStyle } from '../../avatar-style'

/** FAIRY: switches between the Live2D model and the sprite avatar. */

export const AVATAR_STYLE_TOOL_NAME = 'avatar_style'

const tools: Promise<Tool>[] = [
  tool({
    name: AVATAR_STYLE_TOOL_NAME,
    description: 'Switch how you look on the owner\'s screen: your Live2D model, or your sprite avatar (drawn images from the fairy-data/avatar folder, like a PNGtuber). Use it when the owner asks.',
    execute: async (input: { style: AvatarStyle }) => {
      useAvatarStyle().value = input.style
      return `You now show as your ${input.style === 'sprite' ? 'sprite avatar' : 'Live2D model'}.`
    },
    parameters: z.object({ style: z.enum(['live2d', 'sprite']) }),
  }),
]

export const avatarStyleTools = async () => Promise.all(tools)
