import type { Tool } from '@xsai/shared-chat'

import type { Routine, RoutineRequest, RoutineResult } from '../../../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronRoutineAction } from '../../../../shared/eventa'

/**
 * FAIRY: routines, things the character does by itself at a set time, such as a morning summary. They are stored in
 * `fairy-data/routines.json` (see `src/main/services/fairy/routines`).
 */

export const CREATE_ROUTINE_TOOL_NAME = 'create_routine'
export const LIST_ROUTINES_TOOL_NAME = 'list_routines'
export const DELETE_ROUTINE_TOOL_NAME = 'delete_routine'
export const PAUSE_ROUTINE_TOOL_NAME = 'pause_routine'

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

let invoke: ((request: RoutineRequest) => Promise<RoutineResult>) | undefined
async function act(request: RoutineRequest) {
  invoke ??= defineInvoke(createContext(window.electron.ipcRenderer).context, electronRoutineAction)
  return JSON.stringify(await invoke(request))
}

const tools: Promise<Tool>[] = [
  tool({
    name: CREATE_ROUTINE_TOOL_NAME,
    description: [
      'Make a routine: something you do by yourself at a set time, on set days, for example',
      '"every weekday at 08:30, tell me the weather and my reminders for today" or "every evening at 23:00, tell me to go to bed".',
      'At that time you get the instruction and can use all your tools. For a one-time alarm, use set_reminder instead.',
      'Use it only when the owner asks for a routine. Tell them when it runs next.',
    ].join(' '),
    execute: async (input: { name: string, time: string, days: Routine['days'], instruction: string }) =>
      act({ kind: 'create', name: input.name, time: input.time, days: input.days, instruction: input.instruction }),
    parameters: z.object({
      name: z.string().describe('A short name, for example "Good morning".'),
      time: z.string().describe('Local time in 24-hour form, for example "08:30" or "23:00".'),
      days: z.array(z.enum(DAYS)).describe('The days it runs on. An empty list means every day. Weekdays are mon to fri.'),
      instruction: z.string().describe('What to do at that time, in the owner\'s words, so you understand it later without this chat.'),
    }),
  }),
  tool({
    name: LIST_ROUTINES_TOOL_NAME,
    description: 'List the routines with their ids, times, days, instructions, whether they are on, and when each runs next.',
    execute: async () => act({ kind: 'list' }),
    parameters: z.object({}),
  }),
  tool({
    name: DELETE_ROUTINE_TOOL_NAME,
    description: 'Delete a routine for good. List the routines first to find its id. Use it only when the owner asks.',
    execute: async (input: { id: string }) => act({ kind: 'delete', id: input.id }),
    parameters: z.object({ id: z.string().describe('The id from list_routines.') }),
  }),
  tool({
    name: PAUSE_ROUTINE_TOOL_NAME,
    description: 'Pause a routine or turn it back on, without deleting it. List the routines first to find its id. Use it only when the owner asks.',
    execute: async (input: { id: string, paused: boolean }) => act({ kind: 'enable', id: input.id, enabled: !input.paused }),
    parameters: z.object({
      id: z.string().describe('The id from list_routines.'),
      paused: z.boolean().describe('True to pause it, false to turn it back on.'),
    }),
  }),
]

export const routineTools = async () => Promise.all(tools)
