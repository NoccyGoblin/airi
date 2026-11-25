import type { createContext } from '@moeru/eventa/adapters/electron/renderer'
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import type { PhoneChatReply } from '../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'

import { electronPhoneChatReply, electronPhoneChatRequest } from '../../shared/eventa'
import { artistryToolReferences } from '../stores/tools'

type RendererContext = ReturnType<typeof createContext>['context']

const HISTORY_LENGTH = 30

/** Visible text of a stored message, without the hidden stage tokens such as `<|ACT ...|>`. */
export function visibleText(message: ChatHistoryItem): string {
  const content = (message as { content?: unknown }).content
  const raw = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(part => (part && typeof part === 'object' && (part as { type?: string }).type === 'text') ? String((part as { text?: unknown }).text ?? '') : '').join('')
      : ''
  return raw.replace(/<(?:\||\{'\|'\})[\s\S]*?(?:\||\{'\|'\})>/g, '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

function toPhoneMessages(messages: readonly ChatHistoryItem[]) {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({ role: message.role as 'user' | 'assistant', text: visibleText(message) }))
    .filter(message => message.text)
}

/**
 * FAIRY: answers messages from the phone page in this window. A phone message joins the active chat, so the phone and
 * the PC share one conversation, one memory, and every tool.
 */
export function setupPhoneChatBridge(context: RendererContext) {
  const reply = defineInvoke(context, electronPhoneChatReply)
  const send = (answer: PhoneChatReply) => reply(answer).catch(error => console.warn('[phone] reply failed', errorMessageFrom(error)))

  return context.on(electronPhoneChatRequest, async (event) => {
    const request = event.body
    if (!request)
      return
    const sessions = useChatSessionStore()
    const sessionId = sessions.activeSessionId
    try {
      if (request.kind === 'history') {
        const messages = sessions.sessionMessages[sessionId] ?? []
        await send({ id: request.id, ok: true, messages: toPhoneMessages(messages.slice(-HISTORY_LENGTH)) })
        return
      }

      const match = request.image ? /^data:(image\/[\w+]+);base64,(.+)$/.exec(request.image) : null
      const result = await useChatStore().send({
        sessionId,
        text: request.text ?? '',
        attachments: match ? [{ type: 'image', mimeType: match[1], data: match[2] }] : undefined,
        tools: artistryToolReferences,
      })
      const answer = toPhoneMessages(result.messages).filter(message => message.role === 'assistant').map(message => message.text).join('\n\n')
      await send({ id: request.id, ok: true, reply: answer })
    }
    catch (error) {
      await send({ id: request.id, ok: false, error: errorMessageFrom(error) ?? 'Iru could not answer.' })
    }
  })
}
