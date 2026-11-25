import type { Tool } from '@xsai/shared-chat'

import { useCharacterNotebookStore } from '@proj-airi/stage-ui/stores/character'
import { tool } from '@xsai/tool'
import { z } from 'zod'

/**
 * FAIRY: timers and reminders. Each one is a notebook task with `exactTime`, so the character orchestrator makes the
 * companion say it out loud once, at the exact time. Everything stays on this PC.
 *
 * NOTICE: notebook tasks live in memory. A reminder is lost when the app closes before it rings.
 */

export const SET_REMINDER_TOOL_NAME = 'set_reminder'
export const LIST_REMINDERS_TOOL_NAME = 'list_reminders'
export const CANCEL_REMINDER_TOOL_NAME = 'cancel_reminder'

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/

/** The next time the clock shows `hh:mm`: today, or tomorrow when that time has passed. */
export function nextClockTime(hhmm: string, now = new Date()): Date | undefined {
  const match = TIME_PATTERN.exec(hhmm.trim())
  if (!match)
    return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59)
    return undefined
  const at = new Date(now)
  at.setHours(hours, minutes, 0, 0)
  if (at.getTime() <= now.getTime())
    at.setDate(at.getDate() + 1)
  return at
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function openReminders() {
  return useCharacterNotebookStore().tasks.filter(task => task.metadata?.exactTime === true && task.status === 'scheduled' && task.dueAt).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
}

const tools: Promise<Tool>[] = [
  tool({
    name: SET_REMINDER_TOOL_NAME,
    description: [
      'Set a timer or a reminder. You will be told when it is due and must then say it out loud to the user.',
      'Use `inMinutes` for timers ("in 12 minutes", "in 90 seconds" is 1.5) or `atTime` (24-hour "HH:MM", local time) for a clock time.',
      'Give exactly one of them. Confirm the time from the result in one short sentence.',
    ].join(' '),
    execute: async (input: { label: string, inMinutes?: number, atTime?: string }) => {
      let dueAt: number | undefined
      if (typeof input.inMinutes === 'number' && input.inMinutes > 0)
        dueAt = Date.now() + Math.round(input.inMinutes * 60_000)
      else if (input.atTime)
        dueAt = nextClockTime(input.atTime)?.getTime()
      if (!dueAt)
        return JSON.stringify({ ok: false, error: 'Give `inMinutes` (a number above 0) or `atTime` as 24-hour HH:MM.' })

      const task = useCharacterNotebookStore().scheduleTask({
        title: input.label,
        dueAt,
        priority: 'critical',
        metadata: { exactTime: true, source: 'fairy-reminder' },
      })
      return JSON.stringify({ ok: true, id: task.id, label: task.title, ringsAt: clock(dueAt), inMinutes: Number(((dueAt - Date.now()) / 60_000).toFixed(1)) })
    },
    parameters: z.object({
      label: z.string().describe('What to remind the user about, for example "pasta is done" or "drink water".'),
      inMinutes: z.number().optional().describe('Minutes from now. Use decimals for seconds, for example 0.5 for 30 seconds.'),
      atTime: z.string().optional().describe('Local clock time in 24-hour HH:MM, for example "18:30".'),
    }),
  }),
  tool({
    name: LIST_REMINDERS_TOOL_NAME,
    description: 'List the timers and reminders that have not rung yet, with the time each one rings and how many minutes are left.',
    execute: async () => JSON.stringify(openReminders().map(task => ({
      id: task.id,
      label: task.title,
      ringsAt: clock(task.dueAt!),
      minutesLeft: Number(((task.dueAt! - Date.now()) / 60_000).toFixed(1)),
    }))),
    parameters: z.object({}),
  }),
  tool({
    name: CANCEL_REMINDER_TOOL_NAME,
    description: 'Cancel a timer or reminder that has not rung yet, by its label (or a part of it). Use "all" to cancel every one.',
    execute: async (input: { label: string }) => {
      const query = input.label.trim().toLowerCase()
      const matches = openReminders().filter(task => query === 'all' || task.title.toLowerCase().includes(query))
      const notebook = useCharacterNotebookStore()
      for (const task of matches)
        notebook.markTaskDone(task.id)
      return JSON.stringify({ cancelled: matches.map(task => task.title) })
    },
    parameters: z.object({
      label: z.string().describe('The label of the reminder to cancel, a part of it, or "all".'),
    }),
  }),
]

export const reminderTools = async () => Promise.all(tools)
