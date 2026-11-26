import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { FileActionRequest, FileActionResult, FileEntry } from '../../../../shared/eventa'

import { existsSync } from 'node:fs'
import { mkdir, opendir, readdir, rename, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { format } from 'date-fns'
import { app, shell } from 'electron'

import { electronFileAction } from '../../../../shared/eventa'
import { fileNameScore, insideRoots, isRunnable, isSearchedFolder, moveTarget } from './paths'

/**
 * FAIRY: file tools for the character. They work only inside the owner's own folders, never open anything that runs
 * code, never overwrite, and delete only to the Recycle Bin.
 */

const log = useLogg('fairy-files').useGlobalConfig()

const SEARCH_DEPTH = 6
const SEARCH_MAX_ENTRIES = 40_000
const SEARCH_BUDGET_MS = 5_000
const MAX_RESULTS = 20
const MAX_FILES_PER_ACTION = 50

/** The owner's own folders: Desktop, Documents, Downloads, Pictures, Videos, and Music. */
function ownerFolders() {
  const names = ['desktop', 'documents', 'downloads', 'pictures', 'videos', 'music'] as const
  return [...new Set(names.map((name) => {
    try {
      return app.getPath(name)
    }
    catch {
      return ''
    }
  }))].filter(folder => folder && existsSync(folder))
}

async function entryOf(path: string): Promise<FileEntry> {
  const info = await stat(path)
  return {
    path,
    name: basename(path),
    kind: info.isDirectory() ? 'folder' : 'file',
    size: info.isDirectory() ? undefined : info.size,
    modified: format(info.mtime, 'yyyy-MM-dd HH:mm'),
  }
}

async function findFiles(query: string): Promise<FileEntry[]> {
  const deadline = Date.now() + SEARCH_BUDGET_MS
  const matches: { path: string, score: number }[] = []
  const queue = ownerFolders().map(folder => ({ folder, depth: 0 }))
  let seen = 0
  while (queue.length && seen < SEARCH_MAX_ENTRIES && Date.now() < deadline) {
    const { folder, depth } = queue.shift()!
    let directory
    try {
      directory = await opendir(folder)
    }
    catch {
      continue
    }
    for await (const entry of directory) {
      seen++
      const score = fileNameScore(entry.name, query)
      if (score)
        matches.push({ path: join(folder, entry.name), score })
      if (entry.isDirectory() && depth < SEARCH_DEPTH && isSearchedFolder(entry.name))
        queue.push({ folder: join(folder, entry.name), depth: depth + 1 })
    }
  }
  matches.sort((a, b) => b.score - a.score)
  const entries = await Promise.all(matches.slice(0, MAX_RESULTS * 2).map(match => entryOf(match.path).catch(() => undefined)))
  // A newer file wins a tie, because the owner usually means the recent one.
  return entries
    .filter((entry): entry is FileEntry => !!entry)
    .sort((a, b) => fileNameScore(b.name, query) - fileNameScore(a.name, query) || b.modified.localeCompare(a.modified))
    .slice(0, MAX_RESULTS)
}

async function run(request: FileActionRequest): Promise<FileActionResult> {
  const roots = ownerFolders()
  switch (request.kind) {
    case 'find': {
      const items = await findFiles(request.query)
      return { ok: true, message: items.length ? `Found ${items.length} match${items.length > 1 ? 'es' : ''}, best first.` : `Nothing in the owner's folders matches "${request.query}".`, items }
    }
    case 'list': {
      if (!request.path)
        return { ok: true, message: 'The owner\'s folders.', items: await Promise.all(roots.map(entryOf)) }
      const folder = insideRoots(request.path, roots)
      const names = (await readdir(folder)).filter(name => !name.startsWith('.') && name.toLowerCase() !== 'desktop.ini')
      const items = (await Promise.all(names.slice(0, 200).map(name => entryOf(join(folder, name)).catch(() => undefined)))).filter((entry): entry is FileEntry => !!entry)
      return { ok: true, message: `${names.length} item${names.length === 1 ? '' : 's'} in ${folder}${names.length > 200 ? ', the first 200 shown' : ''}.`, items }
    }
    case 'open': {
      const path = insideRoots(request.path, roots)
      if (isRunnable(path))
        throw new Error(`${basename(path)} is a program or script, so it was not opened.`)
      const error = await shell.openPath(path)
      if (error)
        throw new Error(error)
      return { ok: true, message: `Opened ${basename(path)}.` }
    }
    case 'move': {
      const folder = insideRoots(request.folder, roots)
      const sources = request.paths.slice(0, MAX_FILES_PER_ACTION).map(path => insideRoots(path, roots))
      await mkdir(folder, { recursive: true })
      const taken = new Set((await readdir(folder)).map(name => name.toLowerCase()))
      const moved: string[] = []
      for (const source of sources) {
        const target = moveTarget(source, folder, taken)
        await rename(source, target)
        taken.add(basename(target).toLowerCase())
        moved.push(basename(target))
      }
      return { ok: true, message: `Moved ${moved.length} item${moved.length === 1 ? '' : 's'} to ${folder}: ${moved.join(', ')}.` }
    }
    case 'trash': {
      const paths = request.paths.slice(0, MAX_FILES_PER_ACTION).map(path => insideRoots(path, roots))
      if (paths.some(path => roots.includes(path)))
        throw new Error('A main folder, such as Documents, cannot be deleted.')
      for (const path of paths)
        await shell.trashItem(path)
      return { ok: true, message: `Moved ${paths.length} item${paths.length === 1 ? '' : 's'} to the Recycle Bin: ${paths.map(path => basename(path)).join(', ')}. The owner can restore them from there.` }
    }
  }
}

export function createFileActionsService(params: { context: ReturnType<typeof createContext>['context'] }) {
  defineInvokeHandler(params.context, electronFileAction, async (request): Promise<FileActionResult> => {
    try {
      const result = await run(request)
      log.log(`${request.kind}: ${result.message}`)
      return result
    }
    catch (error) {
      const message = errorMessageFrom(error) ?? 'The file action failed.'
      log.warn(`${request.kind} failed: ${message}`)
      return { ok: false, message }
    }
  })
}
