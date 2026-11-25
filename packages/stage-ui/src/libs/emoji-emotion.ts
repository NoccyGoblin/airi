import { Emotion } from '../constants/emotions'

/**
 * FAIRY: emoji as a mood signal. When a reply contains one of these emoji, the avatar shows the matching emotion,
 * the same way as an `<|ACT ...|>` emotion token. Speech never reads emoji (see `withoutEmoji` in core-agent).
 *
 * Variation selectors (U+FE0F) are ignored, so "❤️" and "❤" are the same.
 */
const EMOJI_EMOTIONS: Record<Emotion, string> = {
  [Emotion.Happy]: '😀😃😄😁😆😊🙂☺🥰😍🤗😋😎🥳🎉✨💖💕💗❤😸😺🤩👍💪🌟😂🤣😜😝😛😉😇🫶🌸',
  [Emotion.Sad]: '😢😭😞😔😟🙁☹😿💔🥺😥😓😪',
  [Emotion.Angry]: '😠😡🤬💢😤😾👿',
  [Emotion.Surprise]: '😮😯😲😱🤯😳🙀😦😧',
  [Emotion.Awkward]: '😅😬🫠🙃😶😐😑🫣😰',
  [Emotion.Think]: '🤔🧐💭',
  [Emotion.Question]: '❓❔🤷',
  [Emotion.Curious]: '👀🔍',
  [Emotion.Neutral]: '',
}

const lookup = new Map<string, Emotion>()
for (const [emotion, emojis] of Object.entries(EMOJI_EMOTIONS) as [Emotion, string][]) {
  for (const emoji of Array.from(emojis))
    lookup.set(emoji, emotion)
}

/**
 * The emotion of the last mood emoji in `text`, or undefined when it has none. The last one wins, so
 * "That was close 😅 but we won 🎉" ends happy.
 */
export function emotionFromEmoji(text: string): Emotion | undefined {
  let found: Emotion | undefined
  for (const char of Array.from(text.replace(/️/g, ''))) {
    const emotion = lookup.get(char)
    if (emotion)
      found = emotion
  }
  return found
}
