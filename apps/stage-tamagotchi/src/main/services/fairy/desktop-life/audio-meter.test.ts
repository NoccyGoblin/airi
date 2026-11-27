import { describe, expect, it } from 'vitest'

import { mediaLevel, parsePeaks } from './audio-meter'

describe('parsePeaks', () => {
  it('reads name, process, and level of each app', () => {
    expect(parsePeaks('Spotify|1200|0.410;Discord|88|0.200\n')).toEqual([
      { name: 'Spotify', pid: 1200, peak: 0.41 },
      { name: 'Discord', pid: 88, peak: 0.2 },
    ])
    expect(parsePeaks('')).toEqual([])
  })
})

describe('mediaLevel', () => {
  const levels = [
    { name: 'Discord', pid: 1, peak: 0.9 },
    { name: 'firefox', pid: 2, peak: 0.3 },
    { name: 'electron', pid: 3, peak: 0.8 },
    { name: 'eldenring', pid: 4, peak: 0.7 },
  ]

  it('counts only music and video apps', () => {
    expect(mediaLevel(levels, new Set())).toBe(0.3)
  })

  it('skips the given processes', () => {
    expect(mediaLevel(levels, new Set([2]))).toBe(0)
  })
})
