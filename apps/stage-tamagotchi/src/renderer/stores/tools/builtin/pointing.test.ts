import { describe, expect, it } from 'vitest'

import { parsePointingAnswer, pointingConversation } from './pointing'

describe('parsePointingAnswer', () => {
  it('reads a found point, also with text around it', () => {
    expect(parsePointingAnswer('Here: {"found": true, "x": 10, "y": 20, "what": "Play button"} done'))
      .toEqual({ found: true, x: 10, y: 20, what: 'Play button' })
  })

  it('passes a miss through', () => {
    expect(parsePointingAnswer('{"found": false, "reason": "no such button"}')).toEqual({ found: false, reason: 'no such button' })
  })

  it('turns broken answers into a miss', () => {
    expect(parsePointingAnswer('I think it is top left').found).toBe(false)
    expect(parsePointingAnswer('{"found": true}').found).toBe(false)
    expect(parsePointingAnswer('{"found": tru').found).toBe(false)
  })
})

describe('pointingConversation', () => {
  it('tells the model the screenshot size and sends the image', () => {
    const conversation = pointingConversation('the Play button', { url: 'data:image/jpeg;base64,AAAA', width: 1600, height: 900 })
    expect(JSON.stringify(conversation.turns[0])).toContain('1600x900')
    expect(conversation.turns[1]).toMatchObject({ type: 'user', content: [{ type: 'text', text: 'Find: the Play button' }, { type: 'image', url: 'data:image/jpeg;base64,AAAA' }] })
  })
})
