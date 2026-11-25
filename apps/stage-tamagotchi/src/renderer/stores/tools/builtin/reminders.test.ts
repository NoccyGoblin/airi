import { useCharacterNotebookStore } from '@proj-airi/stage-ui/stores/character'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { nextClockTime, reminderTools } from './reminders'

async function call(name: string, input: Record<string, unknown> = {}) {
  const found = (await reminderTools()).find(t => t.function.name === name)!
  return JSON.parse(await found.execute(input, { messages: [], toolCallId: 'test' }) as string)
}

describe('fairy reminder tools', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 25, 14, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('rings an exact timer at its time, not up to a minute early', async () => {
    const result = await call('set_reminder', { label: 'pasta is done', inMinutes: 2 })
    expect(result.ok).toBe(true)
    const notebook = useCharacterNotebookStore()

    // The scheduler asks with a 60 s early window. An exact timer must not be due yet at 1m30s.
    vi.setSystemTime(new Date(2026, 10, 25, 14, 1, 30))
    expect(notebook.getDueTasks(Date.now(), 60_000)).toHaveLength(0)

    vi.setSystemTime(new Date(2026, 10, 25, 14, 2, 0))
    expect(notebook.getDueTasks(Date.now(), 60_000).map(t => t.title)).toEqual(['pasta is done'])
  })

  it('lists and cancels reminders by part of the label', async () => {
    await call('set_reminder', { label: 'pasta is done', inMinutes: 10 })
    await call('set_reminder', { label: 'drink water', atTime: '15:30' })
    expect((await call('list_reminders')).map((r: { label: string }) => r.label)).toEqual(['pasta is done', 'drink water'])

    expect(await call('cancel_reminder', { label: 'pasta' })).toEqual({ cancelled: ['pasta is done'] })
    expect((await call('list_reminders')).map((r: { label: string }) => r.label)).toEqual(['drink water'])
  })

  it('rejects a reminder without a valid time', async () => {
    expect((await call('set_reminder', { label: 'x', atTime: '25:99' })).ok).toBe(false)
    expect((await call('set_reminder', { label: 'x' })).ok).toBe(false)
  })

  it('moves a clock time that has passed to tomorrow', () => {
    const now = new Date(2026, 10, 25, 14, 0, 0)
    expect(nextClockTime('15:00', now)?.getDate()).toBe(25)
    expect(nextClockTime('13:00', now)?.getDate()).toBe(26)
  })
})
