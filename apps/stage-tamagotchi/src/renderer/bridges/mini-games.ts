import type { createContext } from '@moeru/eventa/adapters/electron/renderer'

import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'

import { electronGameOver } from '../../shared/eventa'

/** The notice that tells her how a game ended. How she reacts is up to her card. */
export function gameOverNotice(event: { game: string, result: 'won' | 'lost' | 'draw', detail: string }) {
  const outcome = event.result === 'won' ? 'You won' : event.result === 'lost' ? 'You lost' : 'It was a draw'
  return `[Game: you played ${event.game} with the owner. ${outcome}. ${event.detail} React to the owner now, in a few words.]`
}

/** FAIRY: tells the character how a mini game ended. Only the main window runs her turns. */
export function setupMiniGamesBridge(context: ReturnType<typeof createContext>['context']) {
  return context.on(electronGameOver, (event) => {
    const sessionId = useChatSessionStore().activeSessionId
    if (!event.body || !sessionId)
      return
    void useChatStore().notifyConversation(sessionId, { source: 'game', text: gameOverNotice(event.body) }, { waitForCompletion: false }).catch(error => console.warn('[mini-games] notice failed', errorMessageFrom(error)))
  })
}
