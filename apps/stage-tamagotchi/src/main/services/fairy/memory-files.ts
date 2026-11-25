import type { FSWatcher } from 'node:fs'

import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { MemoryFileEntry, MemoryFileSave } from '../../../shared/eventa'

import { existsSync, watch } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { app, shell } from 'electron'

import {
  electronMemoryFilesChanged,
  electronMemoryFilesClear,
  electronMemoryFilesList,
  electronMemoryFilesOpenFolder,
  electronMemoryFilesRemove,
  electronMemoryFilesReplace,
  electronMemoryFilesSave,
} from '../../../shared/eventa'
import { isSafeId, parseMemory, serializeMemory, uniqueId } from './memory-files-format'

/**
 * FAIRY: long-term memory as plain text files, one per topic, in `<project folder>\fairy-data\memory`.
 * Everything of the fairy stays in the project folder; `fairy-data` is in .gitignore, so memories never reach GitHub.
 * The user can read and edit every file; the app sees the edits right away.
 * Forgotten memories move to `.forgotten` instead of being deleted, so a mistake can be undone.
 */

const log = useLogg('fairy-memory-files').useGlobalConfig()

/** The project folder: the nearest folder above the app that holds `pnpm-workspace.yaml`. */
function projectRoot(): string | undefined {
  let dir = app.getAppPath()
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')))
      return dir
    const parent = dirname(dir)
    if (parent === dir)
      break
    dir = parent
  }
  return undefined
}

/** Without a project folder, for example in a packaged build, the app's own data folder is used. */
export const FAIRY_DATA_DIR = join(projectRoot() ?? app.getPath('userData'), 'fairy-data')
export const MEMORY_DIR = join(FAIRY_DATA_DIR, 'memory')
const FORGOTTEN_DIR = '.forgotten'
const EXT = '.md'

type MainContext = ReturnType<typeof createContext>['context']

export async function listMemoryFiles(dir = MEMORY_DIR): Promise<MemoryFileEntry[]> {
  await mkdir(dir, { recursive: true })
  const names = (await readdir(dir)).filter(name => name.toLowerCase().endsWith(EXT))
  const entries = await Promise.all(names.map(async (name) => {
    const id = name.slice(0, -EXT.length).toLowerCase()
    if (!isSafeId(id))
      return undefined
    const path = join(dir, name)
    const [text, info] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    const parsed = parseMemory(id, text)
    return parsed.body ? { ...parsed, updatedAt: info.mtimeMs } : undefined
  }))
  return entries.filter((entry): entry is MemoryFileEntry => !!entry).sort((a, b) => a.updatedAt - b.updatedAt)
}

/**
 * Saves a memory. An id of an existing file rewrites that file, so a changed fact (a new main champion) updates the
 * same file. Otherwise a new file is named after the title.
 */
export async function saveMemoryFile(input: MemoryFileSave, dir = MEMORY_DIR): Promise<MemoryFileEntry> {
  await mkdir(dir, { recursive: true })
  const existing = await listMemoryFiles(dir)
  const taken = new Set(existing.map(entry => entry.id))
  const id = input.id && isSafeId(input.id) && taken.has(input.id)
    ? input.id
    : uniqueId(input.description || input.body.slice(0, 40), taken)
  const path = join(dir, `${id}${EXT}`)
  await writeFile(path, serializeMemory(input), 'utf8')
  return { id, description: input.description.trim(), body: input.body.trim(), updatedAt: (await stat(path)).mtimeMs }
}

/** Moves memories to `.forgotten`, with the time in the name, instead of deleting them. */
export async function removeMemoryFiles(ids: string[], dir = MEMORY_DIR): Promise<string[]> {
  const trash = join(dir, FORGOTTEN_DIR)
  await mkdir(trash, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const removed: string[] = []
  for (const id of ids.filter(isSafeId)) {
    try {
      await rename(join(dir, `${id}${EXT}`), join(trash, `${id}.${stamp}${EXT}`))
      removed.push(id)
    }
    catch {
      // Already gone.
    }
  }
  return removed
}

export async function clearMemoryFiles(dir = MEMORY_DIR) {
  await removeMemoryFiles((await listMemoryFiles(dir)).map(entry => entry.id), dir)
}

export async function replaceMemoryFiles(entries: MemoryFileSave[], dir = MEMORY_DIR) {
  await clearMemoryFiles(dir)
  for (const entry of entries)
    await saveMemoryFile({ description: entry.description, body: entry.body }, dir)
}

// -- Change notifications for every window --

const contexts = new Set<MainContext>()
let watcher: FSWatcher | undefined
let debounce: ReturnType<typeof setTimeout> | undefined

function notifyChanged() {
  clearTimeout(debounce)
  // Editors save in several steps. Wait until the folder is quiet.
  debounce = setTimeout(() => {
    for (const context of contexts)
      context.emit(electronMemoryFilesChanged, undefined)
  }, 300)
}

async function ensureWatcher() {
  if (watcher)
    return
  await mkdir(MEMORY_DIR, { recursive: true })
  watcher = watch(MEMORY_DIR, (_event, name) => {
    if (!name || name.toString().toLowerCase().endsWith(EXT))
      notifyChanged()
  })
  watcher.on('error', error => log.withError(error).warn('memory folder watcher stopped'))
}

export function createMemoryFilesService(params: { context: MainContext, onClosed: (stop: () => void) => void }): void {
  contexts.add(params.context)
  params.onClosed(() => contexts.delete(params.context))
  void ensureWatcher().catch(error => log.withError(error).warn('cannot watch the memory folder'))

  defineInvokeHandler(params.context, electronMemoryFilesList, () => listMemoryFiles())
  defineInvokeHandler(params.context, electronMemoryFilesSave, input => saveMemoryFile(input))
  defineInvokeHandler(params.context, electronMemoryFilesRemove, ids => removeMemoryFiles(ids))
  defineInvokeHandler(params.context, electronMemoryFilesClear, () => clearMemoryFiles())
  defineInvokeHandler(params.context, electronMemoryFilesReplace, entries => replaceMemoryFiles(entries))
  defineInvokeHandler(params.context, electronMemoryFilesOpenFolder, async () => {
    await mkdir(MEMORY_DIR, { recursive: true })
    await shell.openPath(MEMORY_DIR)
  })
}
