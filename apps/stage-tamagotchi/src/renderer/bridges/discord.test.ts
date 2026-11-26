import { describe, expect, it } from 'vitest'

import { discordNote } from './discord'

describe('discordNote', () => {
  it('says who spoke and that the answer is spoken in a call', () => {
    const note = discordNote({ place: 'the voice call General on Example Server', speaker: 'Sam', text: 'Lumi, hi!', voice: true })
    expect(note).toContain('Sam said this out loud in the voice call General')
    expect(note).toContain('spoken aloud to everyone')
    expect(note.endsWith('\nLumi, hi!')).toBe(true)
  })

  it('says that a text answer is posted in the channel', () => {
    expect(discordNote({ place: '#general on Example Server', speaker: 'Sam', text: 'hey', voice: false })).toContain('Sam wrote this in #general')
  })
})
