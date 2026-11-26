import { describe, expect, it } from 'vitest'

import { activityLine } from './activity-status'

describe('activityLine', () => {
  it('names what she does with the detail from the input', () => {
    expect(activityLine('open_app', { name: 'Discord' })).toBe('Opening Discord…')
    expect(activityLine('play_youtube', { query: 'lofi beats' })).toBe('Finding lofi beats on YouTube…')
    expect(activityLine('scroll', { direction: 'up', notches: 3 })).toBe('Scrolling up…')
  })

  it('cuts a long detail', () => {
    expect(activityLine('web_search', { query: 'how many dewdrops fit in a fairy teacup today' })).toBe('Searching how many dewdrops fit in a…')
  })

  it('works without a detail and stays quiet for unknown tools', () => {
    expect(activityLine('read_app', { app: '' })).toBe('Looking at the app…')
    expect(activityLine('memory_write', {})).toBeUndefined()
  })
})
