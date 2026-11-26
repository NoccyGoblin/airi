import type { Conversation } from '@proj-airi/core-agent'

/**
 * FAIRY: asks a vision model where something is on a screenshot, so the character can click it by description.
 */

export interface PointingAnswer {
  found: boolean
  x?: number
  y?: number
  what?: string
  reason?: string
}

/** A one-turn request that asks for the center of `target` on a screenshot of `width` x `height` pixels. */
export function pointingConversation(target: string, image: { url: string, width: number, height: number }): Conversation {
  return { turns: [
    {
      id: 'pointing-instructions',
      type: 'system',
      authority: 'system',
      content: [{ type: 'text', text: [
        `You find things on a screenshot of ${image.width}x${image.height} pixels, so a program can click them.`,
        'Reply with one JSON object and nothing else.',
        'When you find the thing: {"found": true, "x": <center x in pixels>, "y": <center y in pixels>, "what": "<what is there, in a few words>"}.',
        'When it is not on the screenshot or you are unsure: {"found": false, "reason": "<why, and what you see instead>"}.',
        'Pixels count from the top left corner of the screenshot.',
      ].join('\n') }],
    },
    {
      id: 'pointing-request',
      type: 'user',
      content: [
        { type: 'text', text: `Find: ${target}` },
        { type: 'image', url: image.url },
      ],
    },
  ] }
}

/** A one-turn request that answers a question about a screenshot in plain words. */
export function describingConversation(question: string, imageUrl: string): Conversation {
  return { turns: [
    {
      id: 'describing-instructions',
      type: 'system',
      authority: 'system',
      content: [{ type: 'text', text: 'You look at a screenshot of the user\'s screen for an assistant that cannot see it. Answer the question in at most 80 words. Name visible buttons, tabs, and text when they matter.' }],
    },
    {
      id: 'describing-request',
      type: 'user',
      content: [
        { type: 'text', text: question || 'What is on the screen?' },
        { type: 'image', url: imageUrl },
      ],
    },
  ] }
}

/**
 * Reads the JSON answer of the pointing model. Text around the object is ignored.
 *
 * @example
 * parsePointingAnswer('{"found": true, "x": 10, "y": 20, "what": "Play"}') // { found: true, x: 10, y: 20, what: 'Play' }
 */
export function parsePointingAnswer(reply: string): PointingAnswer {
  const json = reply.match(/\{[\s\S]*\}/)?.[0]
  if (!json)
    return { found: false, reason: 'The vision model gave no answer.' }
  try {
    const answer = JSON.parse(json) as PointingAnswer
    if (answer.found && (typeof answer.x !== 'number' || typeof answer.y !== 'number'))
      return { found: false, reason: 'The vision model gave no position.' }
    return answer
  }
  catch {
    return { found: false, reason: 'The vision model gave an unreadable answer.' }
  }
}
