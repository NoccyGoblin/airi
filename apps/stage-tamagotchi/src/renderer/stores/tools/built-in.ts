import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import type { ChatToolReference } from '@proj-airi/stage-ui/types/chat'
import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { TOOL_ICONS } from '@proj-airi/stage-ui/tools/icons'
import { defineStore } from 'pinia'

import { AVATAR_STYLE_TOOL_NAME, avatarStyleTools } from './builtin/avatar-style'
import { BROWSER_BACK_TOOL_NAME, BROWSER_CLICK_TOOL_NAME, BROWSER_CLOSE_TOOL_NAME, BROWSER_OPEN_TOOL_NAME, BROWSER_READ_TOOL_NAME, BROWSER_SCROLL_TOOL_NAME, BROWSER_TYPE_TOOL_NAME, browserTools } from './builtin/browser'
import { fileTools, FIND_FILES_TOOL_NAME, LIST_FOLDER_TOOL_NAME, MOVE_FILES_TOOL_NAME, OPEN_FILE_TOOL_NAME, TRASH_FILES_TOOL_NAME } from './builtin/files'
import { GAME_BUDDY_TOOL_NAME, gameBuddyTools, SMART_SPOT_TOOL_NAME } from './builtin/game-buddy'
import { imageJournalTools } from './builtin/image-journal'
import { LEAGUE_LIVE_GAME_TOOL_NAME, LEAGUE_LOOKUP_TOOL_NAME, leagueTools } from './builtin/league'
import { miniGameTools, PLAY_GAME_TOOL_NAME } from './builtin/mini-games'
import { MISCHIEF_MODE_TOOL_NAME, mischiefTools } from './builtin/mischief'
import { CIRCLE_ON_SCREEN_TOOL_NAME, CLICK_ELEMENT_TOOL_NAME, CLICK_ON_TOOL_NAME, CLOSE_APP_TOOL_NAME, DESCRIBE_SCREEN_TOOL_NAME, DISCORD_MESSAGE_TOOL_NAME, DOODLE_TOOL_NAME, MEDIA_CONTROL_TOOL_NAME, OPEN_APP_TOOL_NAME, OPEN_WEBSITE_TOOL_NAME, pcActionTools, PLAY_YOUTUBE_TOOL_NAME, PRESS_KEYS_TOOL_NAME, READ_APP_TOOL_NAME, SCROLL_TOOL_NAME, TYPE_TEXT_TOOL_NAME, WANDER_MODE_TOOL_NAME } from './builtin/pc-actions'
import { MESSAGE_PHONE_TOOL_NAME, phoneMessageTools } from './builtin/phone-message'
import { CANCEL_REMINDER_TOOL_NAME, LIST_REMINDERS_TOOL_NAME, reminderTools, SET_REMINDER_TOOL_NAME } from './builtin/reminders'
import { CREATE_ROUTINE_TOOL_NAME, DELETE_ROUTINE_TOOL_NAME, LIST_ROUTINES_TOOL_NAME, PAUSE_ROUTINE_TOOL_NAME, routineTools } from './builtin/routines'
import { STICKY_NOTE_TOOL_NAME, stickyNoteTools } from './builtin/sticky-notes'
import { TOOLBOX_TOOL_NAME, toolboxTools } from './builtin/toolbox'
import { LIST_WATCHES_TOOL_NAME, STOP_WATCHING_TOOL_NAME, WATCH_FOR_TOOL_NAME, watchTools } from './builtin/watch'
import { weatherTools } from './builtin/weather'
import { WEB_SEARCH_TOOL_NAME, webKnowledgeTools, WIKIPEDIA_TOOL_NAME } from './builtin/web-knowledge'
import { widgetsTools } from './builtin/widgets'

export const widgetToolReferences = [
  // FAIRY: the toolbox. Only the groups that she opens reach the model. See `builtin/toolbox.ts`.
  { name: TOOLBOX_TOOL_NAME },
  // FAIRY: "tell me when…" watches of the screen.
  { name: WATCH_FOR_TOOL_NAME },
  { name: LIST_WATCHES_TOOL_NAME },
  { name: STOP_WATCHING_TOOL_NAME },
  // FAIRY: sticky notes on the screen.
  { name: STICKY_NOTE_TOOL_NAME },
  // FAIRY: game buddy mode and smart spot.
  { name: GAME_BUDDY_TOOL_NAME },
  { name: SMART_SPOT_TOOL_NAME },
  // FAIRY: notifications on the owner's phone.
  { name: MESSAGE_PHONE_TOOL_NAME },
  // FAIRY: mini games with her.
  { name: PLAY_GAME_TOOL_NAME },
  // FAIRY: mischief mode.
  { name: MISCHIEF_MODE_TOOL_NAME },
  // FAIRY: Live2D model or sprite avatar.
  { name: AVATAR_STYLE_TOOL_NAME },
  { name: 'stage_widgets' },
  { name: 'get_weather' },
  // FAIRY: League facts from Riot's data, offered with every chat and voice message.
  { name: LEAGUE_LIVE_GAME_TOOL_NAME },
  { name: LEAGUE_LOOKUP_TOOL_NAME },
  // FAIRY: local timers and reminders that she says out loud.
  { name: SET_REMINDER_TOOL_NAME },
  { name: LIST_REMINDERS_TOOL_NAME },
  { name: CANCEL_REMINDER_TOOL_NAME },
  // FAIRY: routines that run by themselves at set times.
  { name: CREATE_ROUTINE_TOOL_NAME },
  { name: LIST_ROUTINES_TOOL_NAME },
  { name: DELETE_ROUTINE_TOOL_NAME },
  { name: PAUSE_ROUTINE_TOOL_NAME },
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
  { name: WANDER_MODE_TOOL_NAME },
  { name: PLAY_YOUTUBE_TOOL_NAME },
  { name: READ_APP_TOOL_NAME },
  { name: CLICK_ELEMENT_TOOL_NAME },
  { name: CLICK_ON_TOOL_NAME },
  { name: CIRCLE_ON_SCREEN_TOOL_NAME },
  { name: DOODLE_TOOL_NAME },
  { name: DESCRIBE_SCREEN_TOOL_NAME },
  { name: SCROLL_TOOL_NAME },
  { name: MEDIA_CONTROL_TOOL_NAME },
  // FAIRY: files in the owner's own folders.
  { name: FIND_FILES_TOOL_NAME },
  { name: LIST_FOLDER_TOOL_NAME },
  { name: OPEN_FILE_TOOL_NAME },
  { name: MOVE_FILES_TOOL_NAME },
  { name: TRASH_FILES_TOOL_NAME },
  // FAIRY: the character's own browser window for tasks on websites.
  { name: BROWSER_OPEN_TOOL_NAME },
  { name: BROWSER_READ_TOOL_NAME },
  { name: BROWSER_CLICK_TOOL_NAME },
  { name: BROWSER_TYPE_TOOL_NAME },
  { name: BROWSER_BACK_TOOL_NAME },
  { name: BROWSER_SCROLL_TOOL_NAME },
  { name: BROWSER_CLOSE_TOOL_NAME },
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
    const groups: Array<{ tools: Tool[], icon: string }> = await Promise.all([
      imageJournalTools().then(tools => ({ tools, icon: TOOL_ICONS.imageJournal })),
      widgetsTools().then(tools => ({ tools, icon: TOOL_ICONS.widgets })),
      weatherTools().then(tools => ({ tools, icon: TOOL_ICONS.weather })),
      leagueTools().then(tools => ({ tools, icon: TOOL_ICONS.game })),
      reminderTools().then(tools => ({ tools, icon: TOOL_ICONS.timer })),
      routineTools().then(tools => ({ tools, icon: TOOL_ICONS.timer })),
      webKnowledgeTools().then(tools => ({ tools, icon: TOOL_ICONS.search })),
      pcActionTools().then(tools => ({ tools, icon: TOOL_ICONS.computerUse })),
      fileTools().then(tools => ({ tools, icon: TOOL_ICONS.generic })),
      browserTools().then(tools => ({ tools, icon: TOOL_ICONS.search })),
      toolboxTools().then(tools => ({ tools, icon: TOOL_ICONS.generic })),
      watchTools().then(tools => ({ tools, icon: TOOL_ICONS.timer })),
      stickyNoteTools().then(tools => ({ tools, icon: TOOL_ICONS.generic })),
      phoneMessageTools().then(tools => ({ tools, icon: TOOL_ICONS.generic })),
      gameBuddyTools().then(tools => ({ tools, icon: TOOL_ICONS.game })),
      miniGameTools().then(tools => ({ tools, icon: TOOL_ICONS.game })),
      mischiefTools().then(tools => ({ tools, icon: TOOL_ICONS.game })),
      avatarStyleTools().then(tools => ({ tools, icon: TOOL_ICONS.generic })),
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
