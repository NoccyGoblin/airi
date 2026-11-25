import { describe, expect, it } from 'vitest'

import { Emotion } from '../constants/emotions'
import { emotionFromEmoji } from './emoji-emotion'

describe('emotionFromEmoji (FAIRY)', () => {
  it('maps mood emoji to the avatar emotions', () => {
    expect(emotionFromEmoji('You hit Diamond?! 🎉')).toBe(Emotion.Happy)
    expect(emotionFromEmoji('Oh no, that game 😢')).toBe(Emotion.Sad)
    expect(emotionFromEmoji('Who fed again 😤')).toBe(Emotion.Angry)
    expect(emotionFromEmoji('Wait what 😱')).toBe(Emotion.Surprise)
    expect(emotionFromEmoji('Oops 😅')).toBe(Emotion.Awkward)
    expect(emotionFromEmoji('Hmm 🤔')).toBe(Emotion.Think)
  })

  it('ignores the variation selector and lets the last emoji win', () => {
    expect(emotionFromEmoji('love that ❤️')).toBe(Emotion.Happy)
    expect(emotionFromEmoji('That was close 😅 but we won 🎉')).toBe(Emotion.Happy)
  })

  it('returns undefined without a mood emoji', () => {
    expect(emotionFromEmoji('Plain text, 26.22 and #1')).toBeUndefined()
    expect(emotionFromEmoji('A cat 🐈')).toBeUndefined()
  })
})
