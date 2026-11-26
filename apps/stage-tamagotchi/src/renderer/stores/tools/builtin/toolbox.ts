import type { Tool } from '@xsai/shared-chat'

import { tool } from '@xsai/tool'
import { z } from 'zod'

import { BROWSER_BACK_TOOL_NAME, BROWSER_CLICK_TOOL_NAME, BROWSER_CLOSE_TOOL_NAME, BROWSER_OPEN_TOOL_NAME, BROWSER_READ_TOOL_NAME, BROWSER_SCROLL_TOOL_NAME, BROWSER_TYPE_TOOL_NAME } from './browser'
import { FIND_FILES_TOOL_NAME, LIST_FOLDER_TOOL_NAME, MOVE_FILES_TOOL_NAME, OPEN_FILE_TOOL_NAME, TRASH_FILES_TOOL_NAME } from './files'
import { LEAGUE_LIVE_GAME_TOOL_NAME, LEAGUE_LOOKUP_TOOL_NAME } from './league'
import { CLICK_ELEMENT_TOOL_NAME, CLICK_ON_TOOL_NAME, CLOSE_APP_TOOL_NAME, DESCRIBE_SCREEN_TOOL_NAME, DISCORD_MESSAGE_TOOL_NAME, MEDIA_CONTROL_TOOL_NAME, OPEN_APP_TOOL_NAME, OPEN_WEBSITE_TOOL_NAME, PLAY_YOUTUBE_TOOL_NAME, PRESS_KEYS_TOOL_NAME, READ_APP_TOOL_NAME, SCROLL_TOOL_NAME, TYPE_TEXT_TOOL_NAME, WANDER_MODE_TOOL_NAME } from './pc-actions'
import { CANCEL_REMINDER_TOOL_NAME, LIST_REMINDERS_TOOL_NAME, SET_REMINDER_TOOL_NAME } from './reminders'
import { CREATE_ROUTINE_TOOL_NAME, DELETE_ROUTINE_TOOL_NAME, LIST_ROUTINES_TOOL_NAME, PAUSE_ROUTINE_TOOL_NAME } from './routines'
import { WEB_SEARCH_TOOL_NAME, WIKIPEDIA_TOOL_NAME } from './web-knowledge'

/**
 * FAIRY: the toolbox. Every tool description goes into every model request, and 40 tools cost thousands of tokens
 * on each message. So she carries only `open_toolbox`, and the groups she opens join her tools from the next step of
 * the same message. They close when the message ends.
 */

export const TOOLBOX_TOOL_NAME = 'open_toolbox'

export const TOOL_GROUPS = {
  pc: {
    about: 'open and close apps and websites, play YouTube, media keys, type, press keys, Discord messages, wander mode',
    tools: [OPEN_APP_TOOL_NAME, CLOSE_APP_TOOL_NAME, OPEN_WEBSITE_TOOL_NAME, PLAY_YOUTUBE_TOOL_NAME, MEDIA_CONTROL_TOOL_NAME, TYPE_TEXT_TOOL_NAME, PRESS_KEYS_TOOL_NAME, DISCORD_MESSAGE_TOOL_NAME, WANDER_MODE_TOOL_NAME],
  },
  screen: {
    about: 'read and click buttons in apps, click what you see, look at the screen, scroll',
    tools: [READ_APP_TOOL_NAME, CLICK_ELEMENT_TOOL_NAME, CLICK_ON_TOOL_NAME, DESCRIBE_SCREEN_TOOL_NAME, SCROLL_TOOL_NAME],
  },
  browser: {
    about: 'your own browser window: open pages, read them, click, type, go back',
    tools: [BROWSER_OPEN_TOOL_NAME, BROWSER_READ_TOOL_NAME, BROWSER_CLICK_TOOL_NAME, BROWSER_TYPE_TOOL_NAME, BROWSER_BACK_TOOL_NAME, BROWSER_SCROLL_TOOL_NAME, BROWSER_CLOSE_TOOL_NAME],
  },
  files: {
    about: 'find, list, open, move, and trash the owner\'s files',
    tools: [FIND_FILES_TOOL_NAME, LIST_FOLDER_TOOL_NAME, OPEN_FILE_TOOL_NAME, MOVE_FILES_TOOL_NAME, TRASH_FILES_TOOL_NAME],
  },
  plans: {
    about: 'timers, reminders, and routines that run at set times',
    tools: [SET_REMINDER_TOOL_NAME, LIST_REMINDERS_TOOL_NAME, CANCEL_REMINDER_TOOL_NAME, CREATE_ROUTINE_TOOL_NAME, LIST_ROUTINES_TOOL_NAME, DELETE_ROUTINE_TOOL_NAME, PAUSE_ROUTINE_TOOL_NAME],
  },
  web: {
    about: 'search the web, Wikipedia, the weather, League of Legends player and live game facts',
    tools: [WEB_SEARCH_TOOL_NAME, WIKIPEDIA_TOOL_NAME, 'get_weather', LEAGUE_LOOKUP_TOOL_NAME, LEAGUE_LIVE_GAME_TOOL_NAME],
  },
  stage: {
    about: 'widgets on the stage, and the image journal',
    tools: ['stage_widgets', 'image_journal'],
  },
} as const

export type ToolGroup = keyof typeof TOOL_GROUPS
const GROUP_NAMES = Object.keys(TOOL_GROUPS) as ToolGroup[]
const GROUP_OF = new Map<string, ToolGroup>(GROUP_NAMES.flatMap(group => TOOL_GROUPS[group].tools.map(name => [name, group] as const)))

/** The groups that she opened in the running message. */
const opened = new Set<ToolGroup>()

export function openGroups(groups: readonly ToolGroup[]) {
  for (const group of groups)
    opened.add(group)
}

/** Closes all groups. The main window calls this when a message ends. */
export function closeToolbox() {
  opened.clear()
}

/**
 * Keeps the toolbox, the tools of the opened groups, and every tool outside the groups, such as plugin tools.
 *
 * @example
 * toolsForStep([openToolbox, openApp, webSearch], new Set(['web'])) // => [openToolbox, webSearch]
 */
export function toolsForStep<T extends { function: { name: string } }>(tools: readonly T[], groups: ReadonlySet<ToolGroup> = opened): T[] {
  return tools.filter((candidate) => {
    const group = GROUP_OF.get(candidate.function.name)
    return !group || groups.has(group)
  })
}

const tools: Promise<Tool>[] = [
  tool({
    name: TOOLBOX_TOOL_NAME,
    description: [
      'Open groups of your tools before you use them. Their tools are ready in your next step of this same message, so open a group and then call its tools.',
      'Open every group the task needs at once. The groups close when the message ends.',
      `Groups: ${GROUP_NAMES.map(group => `${group} (${TOOL_GROUPS[group].about})`).join('; ')}.`,
    ].join(' '),
    execute: async (input: { groups: ToolGroup[] }) => {
      openGroups(input.groups)
      const names = input.groups.flatMap(group => TOOL_GROUPS[group].tools)
      return `Opened ${input.groups.join(', ')}. Ready now: ${names.join(', ')}.`
    },
    parameters: z.object({ groups: z.array(z.enum(GROUP_NAMES as [ToolGroup, ...ToolGroup[]])).min(1) }),
  }),
]

export const toolboxTools = async () => Promise.all(tools)
