import type { createContext } from '@moeru/eventa/adapters/electron/renderer'

import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'

import { electronGameOver } from '../../shared/eventa'

/**
 * The notice that tells her how a game ended. It names her and the owner, because "you" alone was read the wrong
 * way round. How she reacts is up to her card.
 */
export function gameOverNotice(event: { game: string, result: 'won' | 'lost' | 'draw', score?: { her: number, owner: number } }, name: string) {
  const outcome = event.result === 'won'
    ? `${name} (you) WON and the owner lost`
    : event.result === 'lost'
      ? `The owner WON and ${name} (you) lost`
      : 'It was a draw, nobody won'
  const score = event.score ? `. Final score: ${name} (you) ${event.score.her}, the owner ${event.score.owner}` : ''
  return `[Game over: ${event.game} between ${name} (you) and the owner. ${outcome}${score}. React to the owner now, in a few words.]`
}

/** FAIRY: tells the character how a mini game ended. Only the main window runs her turns. */
export function setupMiniGamesBridge(context: ReturnType<typeof createContext>['context']) {
  return context.on(electronGameOver, (event) => {
    const sessionId = useChatSessionStore().activeSessionId
    if (!event.body || !sessionId)
      return
    void useChatStore().notifyConversation(sessionId, { source: 'game', text: gameOverNotice(event.body, useAiriCardStore().activeCard?.name || 'you') }, { waitForCompletion: false }).catch(error => console.warn('[mini-games] notice failed', errorMessageFrom(error)))
  })
}
