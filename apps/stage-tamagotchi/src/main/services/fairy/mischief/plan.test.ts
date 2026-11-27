import { describe, expect, it } from 'vitest'

import { doodleProblem } from '../screen-draw/page'
import { nextPrankAt, pickPrank, PRANK_DOODLES, PRANK_GAP_MS } from './plan'

describe('pickPrank', () => {
  it('never repeats the last prank', () => {
    for (let index = 0; index < 20; index++)
      expect(pickPrank('popup', { tugAllowed: true }, () => index / 20)).not.toBe('popup')
  })

  it('leaves out the cursor tug when the pointer may not move', () => {
    for (let index = 0; index < 20; index++)
      expect(pickPrank(undefined, { tugAllowed: false }, () => index / 20)).not.toBe('tug')
  })
})

describe('nextPrankAt', () => {
  it('waits between 10 and 25 minutes', () => {
    expect(nextPrankAt(0, () => 0)).toBe(PRANK_GAP_MS[0])
    expect(nextPrankAt(0, () => 0.999)).toBeLessThan(PRANK_GAP_MS[1])
  })
})

describe('prank doodles', () => {
  it('pass the doodle check', () => {
    for (const doodle of PRANK_DOODLES)
      expect(doodleProblem(doodle)).toBeUndefined()
  })
})
