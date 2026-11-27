/**
 * FAIRY: which image of the sprite avatar shows now. Images are named after states, and a missing image falls back
 * to a similar one, then to `idle`. So two or three drawings are enough to start, and each new drawing adds detail.
 */

/** A state of the body from the desktop: a throw, a nap, a dance, or a prank. It wins over everything else. */
export type BodyState = 'thrown' | 'landed' | 'sleeping' | 'dancing' | 'mischief'

export interface SpriteInputs {
  body?: BodyState
  /** An emotion such as "happy", from the reply she is giving. */
  emotion?: string
  thinking: boolean
  /** Her voice is loud enough now for an open mouth. */
  mouthOpen: boolean
  blinking: boolean
}

/** Similar images to try, in order, when a state has no image of its own. */
const FALLBACKS: Record<string, string[]> = {
  landed: ['surprised'],
  mischief: ['happy'],
  dancing: ['happy'],
  thrown: ['surprised'],
  angry: ['sad'],
  awkward: ['surprised', 'sad'],
  curious: ['thinking'],
  question: ['thinking'],
}

/** The first of a state and its fallbacks that has an image. */
function pick(state: string, available: ReadonlySet<string>): string | undefined {
  return [state, ...(FALLBACKS[state] ?? [])].find(name => available.has(name))
}

/**
 * The image name to show.
 *
 * @example
 * spriteFor({ thinking: false, mouthOpen: true, blinking: false }, new Set(['idle', 'talk'])) // => 'talk'
 */
export function spriteFor(inputs: SpriteInputs, available: ReadonlySet<string>): string {
  const base = (inputs.body && pick(inputs.body, available))
    ?? (inputs.emotion && pick(inputs.emotion, available))
    ?? (inputs.thinking ? pick('thinking', available) : undefined)
    ?? 'idle'

  // A sleeping or thrown body keeps its face. Other states talk and blink.
  if (inputs.body === 'sleeping' || inputs.body === 'thrown')
    return base
  if (inputs.mouthOpen)
    return [`${base}-talk`, 'talk'].find(name => available.has(name)) ?? base
  if (inputs.blinking)
    return [`${base}-blink`, ...(base === 'idle' ? ['blink'] : [])].find(name => available.has(name)) ?? base
  return base
}

/** The emotion of a Live2D motion group, which the stage sets when her reply shows an emotion. */
export function emotionOfMotion(group: string | undefined): string | undefined {
  const emotions: Record<string, string> = { Happy: 'happy', Sad: 'sad', Angry: 'angry', Think: 'thinking', Surprise: 'surprised', Awkward: 'awkward', Question: 'question', Curious: 'curious' }
  return group ? emotions[group] : undefined
}
