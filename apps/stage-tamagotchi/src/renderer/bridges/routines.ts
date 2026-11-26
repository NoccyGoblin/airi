import type { createContext } from '@moeru/eventa/adapters/electron/renderer'

import type { Routine } from '../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'

import { electronRoutineDue } from '../../shared/eventa'
import { artistryToolReferences } from '../stores/tools'

type RendererContext = ReturnType<typeof createContext>['context']

export const ROUTINE_SOURCE = 'routine'

/** The notice that tells the character to do a routine now. It holds the owner's own words for the task. */
export function routineNotice(routine: Pick<Routine, 'name' | 'time' | 'instruction'>) {
  return [
    `Routine "${routine.name}" (${routine.time}) is due now. The owner set it up to run by itself.`,
    `What the owner wants: ${routine.instruction}`,
    'Do it now with your tools, then tell the owner the result in a few short sentences, in your own way.',
  ].join('\n')
}

/**
 * FAIRY: runs a due routine in the active chat. The main process sends it only to the main window. The routine gets
 * the same tools as a chat message, so it can check the weather, search, or open things.
 */
export function setupRoutinesBridge(context: RendererContext) {
  return context.on(electronRoutineDue, (event) => {
    const routine = event.body
    if (!routine)
      return
    const sessionId = useChatSessionStore().activeSessionId
    if (!sessionId)
      return
    useChatStore()
      .notifyConversation(sessionId, { source: ROUTINE_SOURCE, text: routineNotice(routine) }, { tools: artistryToolReferences, waitForCompletion: false })
      .catch(error => console.warn('[routines] run failed', errorMessageFrom(error)))
  })
}
