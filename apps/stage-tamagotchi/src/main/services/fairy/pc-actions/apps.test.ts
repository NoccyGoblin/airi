import { describe, expect, it } from 'vitest'

import { matchStartApps, normalizeWebAddress } from './apps'

const apps = [
  { name: 'Chrome Remote Desktop', appId: 'remote' },
  { name: 'Google Chrome', appId: 'chrome' },
  { name: 'Spotify', appId: 'spotify' },
  { name: 'Discord', appId: 'discord' },
  { name: 'Riot Client', appId: 'riot' },
]

describe('matchStartApps', () => {
  it('prefers an exact name, then a name start, then a word start', () => {
    expect(matchStartApps(apps, 'spotify')[0].appId).toBe('spotify')
    expect(matchStartApps(apps, 'disc')[0].appId).toBe('discord')
    expect(matchStartApps(apps, 'riot')[0].appId).toBe('riot')
  })

  it('counts a whole word anywhere, and picks the shorter name on a tie', () => {
    expect(matchStartApps(apps, 'chrome').map(app => app.appId)).toEqual(['chrome', 'remote'])
    expect(matchStartApps(apps, 'google')[0].appId).toBe('chrome')
  })

  it('returns nothing for an unknown or empty name', () => {
    expect(matchStartApps(apps, 'photoshop')).toEqual([])
    expect(matchStartApps(apps, '  ')).toEqual([])
  })
})

describe('normalizeWebAddress', () => {
  it('adds https to a bare domain and keeps full addresses', () => {
    expect(normalizeWebAddress('youtube.com')).toBe('https://youtube.com/')
    expect(normalizeWebAddress('https://www.example.com/watch?v=1&t=2')).toBe('https://www.example.com/watch?v=1&t=2')
  })

  it('rejects other schemes and words that are not addresses', () => {
    expect(() => normalizeWebAddress('file:///C:/Windows')).toThrow('Only http and https')
    expect(() => normalizeWebAddress('youtube')).toThrow('not a web address')
  })
})
