import { describe, expect, it } from 'vitest'

import { chatKindOf } from './chats'

describe('chatKindOf', () => {
  it('treats a Discord title that starts with @ as a direct message', () => {
    expect(chatKindOf('Discord', '@tom - Discord')).toBe('direct')
  })

  it('treats every other Discord view as a group', () => {
    expect(chatKindOf('Discord', '#general | Gaming Friends - Discord')).toBe('group')
    expect(chatKindOf('Discord', 'Squad Chat - Discord')).toBe('group')
    expect(chatKindOf('Discord', 'Friends - Discord')).toBe('group')
  })

  it('ignores other apps', () => {
    expect(chatKindOf('firefox', '@tom - Mozilla Firefox')).toBe('other')
  })
})
