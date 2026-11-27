import { describe, expect, it } from 'vitest'

import { doodleProblem, DRAW_PAGE } from './page'

describe('doodleProblem', () => {
  it('lets plain shapes through', () => {
    expect(doodleProblem('<svg viewBox="0 0 400 400"><circle cx="200" cy="200" r="80"/><path d="M10 10 L50 50"/></svg>')).toBeUndefined()
  })

  it('refuses scripts, links, pictures, and events', () => {
    expect(doodleProblem('<svg><script>alert(1)</script></svg>')).toBeDefined()
    expect(doodleProblem('<svg><a href="https://example.com"><circle r="2"/></a></svg>')).toBeDefined()
    expect(doodleProblem('<svg><image href="x.png"/></svg>')).toBeDefined()
    expect(doodleProblem('<svg><circle r="2" onclick="alert(1)"/></svg>')).toBeDefined()
    expect(doodleProblem('<svg><rect style="fill:url(#x)"/></svg>')).toBeDefined()
  })

  it('needs one svg element', () => {
    expect(doodleProblem('<circle r="2"/>')).toBeDefined()
  })
})

describe('the drawing page', () => {
  it('has the drawing functions', () => {
    expect(DRAW_PAGE).toContain('window.drawMark')
    expect(DRAW_PAGE).toContain('window.drawDoodle')
  })
})
