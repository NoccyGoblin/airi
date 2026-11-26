import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { watch } from 'vue'

/**
 * FAIRY: the owner can talk to the character while she does a job on the PC. A message that comes while her turn
 * uses PC tools waits here, and her next tool result carries it, so she can change course without starting over.
 * A message that no tool result carried gets its own turn after the job, as before.
 */

interface WaitingNote {
  text: string
  receipt: { sessionId: string, messageId: string }
  resolve: (receipt: { sessionId: string, messageId: string }) => void
  fallback: () => Promise<{ sessionId: string, messageId: string }>
}

/** The session whose running turn used a PC tool. It ends when the turn ends. */
let jobSessionId: string | undefined
const waiting: WaitingNote[] = []

/**
 * The text that a tool result carries for the owner's messages. The words are the owner's, so they are instructions
 * like any owner message.
 */
export function ownerNotesText(texts: readonly string[]) {
  if (!texts.length)
    return ''
  return `\n\n[The owner said this while you were working: ${texts.map(text => `"${text}"`).join(' and ')}. It can change the job. Follow it now.]`
}

/**
 * Marks that the active turn works with PC tools, and returns the owner's waiting messages for the tool result.
 * Every PC tool calls this with its result.
 */
export function withOwnerNotes(result: string): string {
  jobSessionId = useChatSessionStore().activeSessionId
  const notes = waiting.splice(0)
  for (const note of notes)
    note.resolve(note.receipt)
  return result + ownerNotesText(notes.map(note => note.text))
}

/** Registers the mid-job path in the chat store. Only the main window runs turns, so only it sets this up. */
export function setupMidJobBridge() {
  const chat = useChatStore()
  chat.setMidTurnSteer((payload, fallback) => {
    const text = payload.text.trim()
    if (!chat.sending || !jobSessionId || payload.sessionId !== jobSessionId || !text)
      return undefined
    return new Promise((resolve) => {
      waiting.push({ text, receipt: { sessionId: payload.sessionId, messageId: payload.messageId }, resolve, fallback })
    })
  })

  // When the turn ends, the job ends. A message that no tool result carried becomes a normal message.
  const stop = watch(() => chat.sending, (sending) => {
    if (sending)
      return
    jobSessionId = undefined
    for (const note of waiting.splice(0))
      void note.fallback().then(note.resolve, () => note.resolve(note.receipt))
  })

  return () => {
    stop()
    chat.setMidTurnSteer(undefined)
  }
}
