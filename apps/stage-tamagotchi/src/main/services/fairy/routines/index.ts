import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { Routine, RoutineRequest, RoutineResult } from '../../../../shared/eventa'

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'

import { electronRoutineAction, electronRoutineDue } from '../../../../shared/eventa'
import { FAIRY_DATA_DIR } from '../memory-files'
import { isDue, nextRun, parseTime, WEEKDAYS } from './schedule'

/**
 * FAIRY: routines of the character, stored in `fairy-data/routines.json` so the owner can read and edit them.
 * The main process checks them every half minute and sends a due routine to the main window.
 */

const ROUTINES_FILE = join(FAIRY_DATA_DIR, 'routines.json')
const CHECK_MS = 30_000
const MAX_ROUTINES = 30

const log = useLogg('fairy-routines').useGlobalConfig()
const storage = new Mutex()

async function load(): Promise<Routine[]> {
  if (!existsSync(ROUTINES_FILE))
    return []
  try {
    const parsed = JSON.parse(await readFile(ROUTINES_FILE, 'utf8')) as { routines?: Routine[] }
    return Array.isArray(parsed.routines) ? parsed.routines : []
  }
  catch (error) {
    log.warn(`routines.json is not readable, so no routine runs: ${errorMessageFrom(error)}`)
    return []
  }
}

/** Writes through a temporary file, so a crash never leaves half a file. */
async function save(routines: Routine[]) {
  await mkdir(FAIRY_DATA_DIR, { recursive: true })
  const temporary = `${ROUTINES_FILE}.tmp`
  await writeFile(temporary, `${JSON.stringify({ routines }, null, 2)}\n`, 'utf8')
  await rename(temporary, ROUTINES_FILE)
}

function withNextRun(routines: Routine[]) {
  const now = new Date()
  return routines.map(routine => ({ ...routine, nextRun: routine.enabled ? nextRun(routine, now) : undefined }))
}

async function run(request: RoutineRequest): Promise<RoutineResult> {
  return await storage.runExclusive(async () => {
    const routines = await load()
    switch (request.kind) {
      case 'list':
        return { ok: true, message: routines.length ? `${routines.length} routine${routines.length > 1 ? 's' : ''}.` : 'No routines yet.', routines: withNextRun(routines) }
      case 'create': {
        if (routines.length >= MAX_ROUTINES)
          throw new Error(`There are already ${MAX_ROUTINES} routines. Delete one first.`)
        const { hours, minutes } = parseTime(request.time)
        const days = request.days.filter(day => (WEEKDAYS as readonly string[]).includes(day))
        const routine: Routine = {
          id: randomUUID().slice(0, 8),
          name: request.name.trim().slice(0, 80) || 'Routine',
          time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
          days,
          instruction: request.instruction.trim().slice(0, 1000),
          enabled: true,
          // A routine made after its time today starts tomorrow, instead of running at once.
          lastRunAt: new Date().toISOString(),
        }
        await save([...routines, routine])
        return { ok: true, message: `Made the routine "${routine.name}".`, routines: withNextRun([routine]) }
      }
      case 'delete': {
        const routine = routines.find(candidate => candidate.id === request.id)
        if (!routine)
          throw new Error(`No routine has the id "${request.id}". List the routines for their ids.`)
        await save(routines.filter(candidate => candidate.id !== request.id))
        return { ok: true, message: `Deleted the routine "${routine.name}".` }
      }
      case 'enable': {
        const routine = routines.find(candidate => candidate.id === request.id)
        if (!routine)
          throw new Error(`No routine has the id "${request.id}". List the routines for their ids.`)
        routine.enabled = request.enabled
        await save(routines)
        return { ok: true, message: `${request.enabled ? 'Turned on' : 'Paused'} the routine "${routine.name}".`, routines: withNextRun([routine]) }
      }
    }
  })
}

/** Lets every window manage the routines. */
export function createRoutinesService(params: { context: ReturnType<typeof createContext>['context'] }) {
  defineInvokeHandler(params.context, electronRoutineAction, async (request): Promise<RoutineResult> => {
    try {
      return await run(request)
    }
    catch (error) {
      return { ok: false, message: errorMessageFrom(error) ?? 'The routine action failed.' }
    }
  })
}

/**
 * Checks the routines every half minute and sends each due one to the main window once.
 *
 * Returns:
 * - A function that stops the checks
 */
export function createRoutineScheduler(params: { context: ReturnType<typeof createContext>['context'] }) {
  const check = () => storage.runExclusive(async () => {
    const routines = await load()
    const now = new Date()
    const due = routines.filter(routine => routine.enabled && isDue(routine, now, routine.lastRunAt ? new Date(routine.lastRunAt) : undefined))
    if (!due.length)
      return
    for (const routine of due)
      routine.lastRunAt = now.toISOString()
    await save(routines)
    for (const routine of due) {
      log.log(`routine due: ${routine.name}`)
      params.context.emit(electronRoutineDue, routine)
    }
  }).catch(error => log.warn(`routine check failed: ${errorMessageFrom(error)}`))
  const timer = setInterval(() => void check(), CHECK_MS)
  // The first check waits a little, so the chat is ready after a start.
  const first = setTimeout(() => void check(), 20_000)
  return () => {
    clearInterval(timer)
    clearTimeout(first)
  }
}
