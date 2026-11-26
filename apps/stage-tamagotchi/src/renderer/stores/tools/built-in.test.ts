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
vi.mock('./builtin/routines', () => ({
  CREATE_ROUTINE_TOOL_NAME: 'create_routine',
  LIST_ROUTINES_TOOL_NAME: 'list_routines',
  DELETE_ROUTINE_TOOL_NAME: 'delete_routine',
  PAUSE_ROUTINE_TOOL_NAME: 'pause_routine',
  routineTools: vi.fn(async () => ['create_routine', 'list_routines', 'delete_routine', 'pause_routine'].map(executableTool)),
}))
vi.mock('./builtin/web-knowledge', () => ({
  WIKIPEDIA_TOOL_NAME: 'wikipedia',
  WEB_SEARCH_TOOL_NAME: 'web_search',
  webKnowledgeTools: vi.fn(async () => [executableTool('wikipedia'), executableTool('web_search')]),
}))
vi.mock('./builtin/pc-actions', () => ({
  OPEN_WEBSITE_TOOL_NAME: 'open_website',
  OPEN_APP_TOOL_NAME: 'open_app',
  CLOSE_APP_TOOL_NAME: 'close_app',
  TYPE_TEXT_TOOL_NAME: 'type_text',
  DISCORD_MESSAGE_TOOL_NAME: 'discord_message',
  WANDER_MODE_TOOL_NAME: 'wander_mode',
  PLAY_YOUTUBE_TOOL_NAME: 'play_youtube',
  READ_APP_TOOL_NAME: 'read_app',
  CLICK_ELEMENT_TOOL_NAME: 'click_element',
  CLICK_ON_TOOL_NAME: 'click_on',
  DESCRIBE_SCREEN_TOOL_NAME: 'describe_screen',
  SCROLL_TOOL_NAME: 'scroll',
  PRESS_KEYS_TOOL_NAME: 'press_keys',
  MEDIA_CONTROL_TOOL_NAME: 'media_control',
  pcActionTools: vi.fn(async () => ['open_website', 'open_app', 'close_app', 'discord_message', 'type_text', 'press_keys', 'wander_mode', 'play_youtube', 'read_app', 'click_element', 'click_on', 'describe_screen', 'scroll', 'media_control'].map(executableTool)),
}))
vi.mock('./builtin/browser', () => ({
  BROWSER_OPEN_TOOL_NAME: 'browser_open',
  BROWSER_READ_TOOL_NAME: 'browser_read',
  BROWSER_CLICK_TOOL_NAME: 'browser_click',
  BROWSER_TYPE_TOOL_NAME: 'browser_type',
  BROWSER_BACK_TOOL_NAME: 'browser_back',
  BROWSER_SCROLL_TOOL_NAME: 'browser_scroll',
  BROWSER_CLOSE_TOOL_NAME: 'browser_close',
  browserTools: vi.fn(async () => ['browser_open', 'browser_read', 'browser_click', 'browser_type', 'browser_back', 'browser_scroll', 'browser_close'].map(executableTool)),
}))
vi.mock('./builtin/files', () => ({
  FIND_FILES_TOOL_NAME: 'find_files',
  LIST_FOLDER_TOOL_NAME: 'list_folder',
  OPEN_FILE_TOOL_NAME: 'open_file',
  MOVE_FILES_TOOL_NAME: 'move_files',
  TRASH_FILES_TOOL_NAME: 'trash_files',
  fileTools: vi.fn(async () => ['find_files', 'list_folder', 'open_file', 'move_files', 'trash_files'].map(executableTool)),
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
      { id: 'tamagotchi:create_routine', defaultActive: false },
      { id: 'tamagotchi:list_routines', defaultActive: false },
      { id: 'tamagotchi:delete_routine', defaultActive: false },
      { id: 'tamagotchi:pause_routine', defaultActive: false },
      { id: 'tamagotchi:wikipedia', defaultActive: false },
      { id: 'tamagotchi:web_search', defaultActive: false },
      { id: 'tamagotchi:open_website', defaultActive: false },
      { id: 'tamagotchi:open_app', defaultActive: false },
      { id: 'tamagotchi:close_app', defaultActive: false },
      { id: 'tamagotchi:discord_message', defaultActive: false },
      { id: 'tamagotchi:type_text', defaultActive: false },
      { id: 'tamagotchi:press_keys', defaultActive: false },
      { id: 'tamagotchi:wander_mode', defaultActive: false },
      { id: 'tamagotchi:play_youtube', defaultActive: false },
      { id: 'tamagotchi:read_app', defaultActive: false },
      { id: 'tamagotchi:click_element', defaultActive: false },
      { id: 'tamagotchi:click_on', defaultActive: false },
      { id: 'tamagotchi:describe_screen', defaultActive: false },
      { id: 'tamagotchi:scroll', defaultActive: false },
      { id: 'tamagotchi:media_control', defaultActive: false },
      { id: 'tamagotchi:find_files', defaultActive: false },
      { id: 'tamagotchi:list_folder', defaultActive: false },
      { id: 'tamagotchi:open_file', defaultActive: false },
      { id: 'tamagotchi:move_files', defaultActive: false },
      { id: 'tamagotchi:trash_files', defaultActive: false },
      { id: 'tamagotchi:browser_open', defaultActive: false },
      { id: 'tamagotchi:browser_read', defaultActive: false },
      { id: 'tamagotchi:browser_click', defaultActive: false },
      { id: 'tamagotchi:browser_type', defaultActive: false },
      { id: 'tamagotchi:browser_back', defaultActive: false },
      { id: 'tamagotchi:browser_scroll', defaultActive: false },
      { id: 'tamagotchi:browser_close', defaultActive: false },
    ])
    expect(toolsStore.getToolsByNames('computer_use', 'computer_use_read_image')).toEqual([])
    expect(toolsStore.getToolsByNames('get_weather')[0]?.function.name).toBe('get_weather')
  })
})
