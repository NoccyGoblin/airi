import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function executableTool(name: string): Tool {
  return {
    type: 'function',
    function: {
      name,
      parameters: { type: 'object', properties: {} },
    },
    execute: vi.fn(),
  }
}

vi.mock('./builtin/image-journal', () => ({
  imageJournalTools: vi.fn(async () => [executableTool('image_journal')]),
}))
vi.mock('./builtin/weather', () => ({
  weatherTools: vi.fn(async () => [executableTool('get_weather')]),
}))
vi.mock('./builtin/league', () => ({
  LEAGUE_LIVE_GAME_TOOL_NAME: 'league_live_game',
  LEAGUE_LOOKUP_TOOL_NAME: 'league_lookup',
  leagueTools: vi.fn(async () => [executableTool('league_live_game'), executableTool('league_lookup')]),
}))
vi.mock('./builtin/reminders', () => ({
  SET_REMINDER_TOOL_NAME: 'set_reminder',
  LIST_REMINDERS_TOOL_NAME: 'list_reminders',
  CANCEL_REMINDER_TOOL_NAME: 'cancel_reminder',
  reminderTools: vi.fn(async () => [executableTool('set_reminder'), executableTool('list_reminders'), executableTool('cancel_reminder')]),
}))
vi.mock('./builtin/widgets', () => ({
  widgetsTools: vi.fn(async () => [executableTool('stage_widgets')]),
}))

describe('useTamagotchiBuiltinToolsStore', async () => {
  const { useTamagotchiBuiltinToolsStore } = await import('./built-in')

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('registers built-in executors as request-selected tools', async () => {
    const toolsStore = useLlmToolsStore()

    await useTamagotchiBuiltinToolsStore().refresh()

    expect(toolsStore.activeTools).toEqual([])
    expect(toolsStore.tools.map(tool => ({
      id: tool.id,
      defaultActive: tool.defaultActive,
    }))).toEqual([
      { id: 'tamagotchi:image_journal', defaultActive: false },
      { id: 'tamagotchi:stage_widgets', defaultActive: false },
      { id: 'tamagotchi:get_weather', defaultActive: false },
      { id: 'tamagotchi:league_live_game', defaultActive: false },
      { id: 'tamagotchi:league_lookup', defaultActive: false },
      { id: 'tamagotchi:set_reminder', defaultActive: false },
      { id: 'tamagotchi:list_reminders', defaultActive: false },
      { id: 'tamagotchi:cancel_reminder', defaultActive: false },
    ])
    expect(toolsStore.getToolsByNames('computer_use', 'computer_use_read_image')).toEqual([])
    expect(toolsStore.getToolsByNames('get_weather')[0]?.function.name).toBe('get_weather')
  })
})
