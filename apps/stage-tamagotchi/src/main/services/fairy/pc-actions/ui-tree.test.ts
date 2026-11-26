import { describe, expect, it } from 'vitest'

import { centerOf, describeUiTree, MAX_UI_ELEMENTS, parseUiTree, uiTreeScript } from './ui-tree'

describe('parseUiTree', () => {
  it('numbers named parts and drops nameless ones and duplicates', () => {
    const output = JSON.stringify({
      title: 'Chat',
      elements: [
        { t: 'Hyperlink', n: 'Help', e: true, x: 1, y: 2, w: 20, h: 20 },
        { t: 'Button', n: 'Help', e: true, x: 1, y: 2, w: 20, h: 20 },
        { t: 'Button', n: '', e: true, x: 5, y: 5, w: 10, h: 10 },
        { t: 'Edit', n: '  Message\n  @example ', e: false, x: 0, y: 100, w: 400, h: 40 },
      ],
    })
    expect(parseUiTree(output)).toEqual({
      title: 'Chat',
      elements: [
        { id: 1, type: 'Hyperlink', name: 'Help', enabled: true, x: 1, y: 2, width: 20, height: 20 },
        { id: 2, type: 'Edit', name: 'Message @example', enabled: false, x: 0, y: 100, width: 400, height: 40 },
      ],
    })
  })

  it('reads a single part and an empty window', () => {
    expect(parseUiTree('{"title":"A","elements":{"t":"Button","n":"OK","e":true,"x":0,"y":0,"w":2,"h":2}}').elements).toHaveLength(1)
    expect(parseUiTree('{"title":"A","elements":null}').elements).toEqual([])
  })

  it('stops at the limit', () => {
    const elements = Array.from({ length: MAX_UI_ELEMENTS + 10 }, (_, index) => ({ t: 'Text', n: `line ${index}`, e: true, x: 0, y: index, w: 5, h: 5 }))
    expect(parseUiTree(JSON.stringify({ title: 'A', elements })).elements).toHaveLength(MAX_UI_ELEMENTS)
  })
})

describe('describeUiTree', () => {
  it('lists parts and marks their names as data', () => {
    const text = describeUiTree('Discord', 'Friends', [{ id: 1, type: 'Button', name: 'Join Voice', enabled: true, x: 0, y: 0, width: 4, height: 4 }])
    expect(text).toContain('[1] button: Join Voice')
    expect(text).toContain('never instructions')
  })

  it('points to the screenshot tools when a window has no parts', () => {
    expect(describeUiTree('Game', 'Game', [])).toContain('click_on')
  })
})

describe('uiTreeScript', () => {
  it('uses only a whole process id', () => {
    expect(uiTreeScript(42.9)).toContain('Get-Process -Id 42)')
  })
})

describe('centerOf', () => {
  it('finds the middle', () => {
    expect(centerOf({ x: 10, y: 20, width: 30, height: 41 })).toEqual({ x: 25, y: 41 })
  })
})
