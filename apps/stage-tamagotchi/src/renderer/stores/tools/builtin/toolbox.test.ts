import { describe, expect, it } from 'vitest'

import { TOOL_GROUPS, TOOLBOX_TOOL_NAME, toolsForStep } from './toolbox'

const named = (name: string) => ({ function: { name } })

describe('toolsForStep', () => {
  const all = [named(TOOLBOX_TOOL_NAME), named('open_app'), named('web_search'), named('some_plugin_tool')]

  it('keeps only the toolbox and tools outside the groups while the toolbox is closed', () => {
    expect(toolsForStep(all, new Set()).map(tool => tool.function.name)).toEqual([TOOLBOX_TOOL_NAME, 'some_plugin_tool'])
  })

  it('adds the tools of an opened group', () => {
    expect(toolsForStep(all, new Set(['web'])).map(tool => tool.function.name)).toEqual([TOOLBOX_TOOL_NAME, 'web_search', 'some_plugin_tool'])
  })
})

describe('tool groups', () => {
  it('put each tool in one group only', () => {
    const names = Object.values(TOOL_GROUPS).flatMap(group => [...group.tools])
    expect(new Set(names).size).toBe(names.length)
  })
})
