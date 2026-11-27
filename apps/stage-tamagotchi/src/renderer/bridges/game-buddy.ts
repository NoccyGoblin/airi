import type { createContext } from '@moeru/eventa/adapters/electron/renderer'

import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'

import { electronGameBuddyNotice } from '../../shared/eventa'

type RendererContext = ReturnType<typeof createContext>['context']

/**
 * FAIRY: a big moment in the owner's League match becomes a notice in her chat, so she comments on it out loud.
 * The notice gets no tools. Only the main window runs her turns, so only it sets this up.
 */
export function setupGameBuddyBridge(context: RendererContext) {
  return context.on(electronGameBuddyNotice, (event) => {
    const text = event.body?.text
    if (!text)
      return
    const sessionId = useChatSessionStore().activeSessionId
    void useChatStore().notifyConversation(sessionId, { source: 'game-buddy', text }, { waitForCompletion: false }).catch(error => console.warn('[game-buddy] notice failed', errorMessageFrom(error)))
  })
}
