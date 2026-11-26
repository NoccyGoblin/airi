import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import type { ChatToolReference } from '@proj-airi/stage-ui/types/chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { TOOL_ICONS } from '@proj-airi/stage-ui/tools/icons'
import { defineStore } from 'pinia'

import { fileTools, FIND_FILES_TOOL_NAME, LIST_FOLDER_TOOL_NAME, MOVE_FILES_TOOL_NAME, OPEN_FILE_TOOL_NAME, TRASH_FILES_TOOL_NAME } from './builtin/files'
import { imageJournalTools } from './builtin/image-journal'
import { LEAGUE_LIVE_GAME_TOOL_NAME, LEAGUE_LOOKUP_TOOL_NAME, leagueTools } from './builtin/league'
import { CLICK_ON_TOOL_NAME, CLOSE_APP_TOOL_NAME, DESCRIBE_SCREEN_TOOL_NAME, DISCORD_MESSAGE_TOOL_NAME, MEDIA_CONTROL_TOOL_NAME, OPEN_APP_TOOL_NAME, OPEN_WEBSITE_TOOL_NAME, pcActionTools, PRESS_KEYS_TOOL_NAME, SCROLL_TOOL_NAME, TYPE_TEXT_TOOL_NAME } from './builtin/pc-actions'
import { CANCEL_REMINDER_TOOL_NAME, LIST_REMINDERS_TOOL_NAME, reminderTools, SET_REMINDER_TOOL_NAME } from './builtin/reminders'
import { weatherTools } from './builtin/weather'
import { WEB_SEARCH_TOOL_NAME, webKnowledgeTools, WIKIPEDIA_TOOL_NAME } from './builtin/web-knowledge'
import { widgetsTools } from './builtin/widgets'

export const widgetToolReferences = [
  { name: 'stage_widgets' },
  { name: 'get_weather' },
  // FAIRY: League facts from Riot's data, offered with every chat and voice message.
  { name: LEAGUE_LIVE_GAME_TOOL_NAME },
  { name: LEAGUE_LOOKUP_TOOL_NAME },
  // FAIRY: local timers and reminders that she says out loud.
  { name: SET_REMINDER_TOOL_NAME },
  { name: LIST_REMINDERS_TOOL_NAME },
  { name: CANCEL_REMINDER_TOOL_NAME },
  // FAIRY: facts and current information.
  { name: WIKIPEDIA_TOOL_NAME },
  { name: WEB_SEARCH_TOOL_NAME },
  // FAIRY: fast actions on the PC when the owner asks for them.
  { name: OPEN_WEBSITE_TOOL_NAME },
  { name: OPEN_APP_TOOL_NAME },
  { name: CLOSE_APP_TOOL_NAME },
  { name: TYPE_TEXT_TOOL_NAME },
  { name: DISCORD_MESSAGE_TOOL_NAME },
  { name: PRESS_KEYS_TOOL_NAME },
  { name: CLICK_ON_TOOL_NAME },
  { name: DESCRIBE_SCREEN_TOOL_NAME },
  { name: SCROLL_TOOL_NAME },
  { name: MEDIA_CONTROL_TOOL_NAME },
  // FAIRY: files in the owner's own folders.
  { name: FIND_FILES_TOOL_NAME },
  { name: LIST_FOLDER_TOOL_NAME },
  { name: OPEN_FILE_TOOL_NAME },
  { name: MOVE_FILES_TOOL_NAME },
  { name: TRASH_FILES_TOOL_NAME },
] satisfies ChatToolReference[]

export const artistryToolReferences = [
  { name: 'image_journal' },
  ...widgetToolReferences,
] satisfies ChatToolReference[]

export const useTamagotchiBuiltinToolsStore = defineStore('tamagotchi-builtin-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const toolIdPrefix = 'tamagotchi:'

  function registeredToolIds() {
    return llmToolsStore.tools
      .filter(tool => tool.id.startsWith(toolIdPrefix))
      .map(tool => tool.id)
  }

  async function refresh() {
    // Each module declares one icon that the chat shows on every call of its tools.
    const groups = await Promise.all([
      imageJournalTools().then(tools => ({ tools, icon: TOOL_ICONS.imageJournal })),
      widgetsTools().then(tools => ({ tools, icon: TOOL_ICONS.widgets })),
      weatherTools().then(tools => ({ tools, icon: TOOL_ICONS.weather })),
      leagueTools().then(tools => ({ tools, icon: TOOL_ICONS.game })),
      reminderTools().then(tools => ({ tools, icon: TOOL_ICONS.timer })),
      webKnowledgeTools().then(tools => ({ tools, icon: TOOL_ICONS.search })),
      pcActionTools().then(tools => ({ tools, icon: TOOL_ICONS.computerUse })),
      fileTools().then(tools => ({ tools, icon: TOOL_ICONS.generic })),
    ])

    llmToolsStore.removeToolsByIds(...registeredToolIds())
    llmToolsStore.addTools(...groups.flatMap(({ tools, icon }) => tools.map(tool => ({
      ...tool,
      icon,
      defaultActive: false,
      id: `${toolIdPrefix}${tool.function.name}`,
    } satisfies ExecutableTool))))
  }

  return { refresh }
}, {
  synced: {
    actions: ['refresh'],
    state: false,
  },
})
