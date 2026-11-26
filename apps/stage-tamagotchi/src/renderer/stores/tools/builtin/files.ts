import type { Tool } from '@xsai/shared-chat'

import type { FileActionRequest, FileActionResult } from '../../../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronFileAction } from '../../../../shared/eventa'

/**
 * FAIRY: file tools in the owner's own folders (Desktop, Documents, Downloads, Pictures, Videos, Music).
 * The main process does the work and enforces the limits (see `src/main/services/fairy/files`).
 */

export const FIND_FILES_TOOL_NAME = 'find_files'
export const LIST_FOLDER_TOOL_NAME = 'list_folder'
export const OPEN_FILE_TOOL_NAME = 'open_file'
export const MOVE_FILES_TOOL_NAME = 'move_files'
export const TRASH_FILES_TOOL_NAME = 'trash_files'

const ONLY_WHEN_ASKED = 'Use it only when the owner asks for it.'

let invoke: ((request: FileActionRequest) => Promise<FileActionResult>) | undefined
async function act(request: FileActionRequest) {
  invoke ??= defineInvoke(createContext(window.electron.ipcRenderer).context, electronFileAction)
  const result = await invoke(request)
  return JSON.stringify({
    ...result,
    items: result.items?.map(item => ({
      path: item.path,
      kind: item.kind,
      modified: item.modified,
      ...(item.size !== undefined ? { size: describeSize(item.size) } : {}),
    })),
  })
}

/**
 * A file size in short words.
 *
 * @example
 * describeSize(1536) // '1.5 KB'
 */
export function describeSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit ? value.toFixed(1) : value} ${units[unit]}`
}

const tools: Promise<Tool>[] = [
  tool({
    name: FIND_FILES_TOOL_NAME,
    description: [
      'Find files and folders by name in the owner\'s own folders: Desktop, Documents, Downloads, Pictures, Videos, and Music.',
      'All words must be in the name. Results come best first, newer first on a tie, with full paths for the other file tools.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { query: string }) => act({ kind: 'find', query: input.query }),
    parameters: z.object({ query: z.string().describe('Words from the name, for example "resume" or "screenshot 2026".') }),
  }),
  tool({
    name: LIST_FOLDER_TOOL_NAME,
    description: 'List what is in one of the owner\'s folders. Leave the path empty to list the main folders themselves.',
    execute: async (input: { path: string }) => act({ kind: 'list', path: input.path || undefined }),
    parameters: z.object({ path: z.string().describe('The full path of the folder, or an empty string for the main folders.') }),
  }),
  tool({
    name: OPEN_FILE_TOOL_NAME,
    description: [
      'Open a file or folder of the owner with its normal app, for example a PDF, a photo, or a folder in Explorer.',
      'Programs and scripts are never opened.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { path: string }) => act({ kind: 'open', path: input.path }),
    parameters: z.object({ path: z.string().describe('The full path from find_files or list_folder.') }),
  }),
  tool({
    name: MOVE_FILES_TOOL_NAME,
    description: [
      'Move files or folders into a folder in the owner\'s folders, for example to tidy the Downloads folder. The folder is made when it is missing.',
      'Nothing is overwritten: a taken name gets a number, such as "photo (2).jpg". Tell the owner afterwards what moved where.',
      ONLY_WHEN_ASKED,
    ].join(' '),
    execute: async (input: { paths: string[], folder: string }) => act({ kind: 'move', paths: input.paths, folder: input.folder }),
    parameters: z.object({
      paths: z.array(z.string()).min(1).max(50).describe('Full paths of the files or folders to move.'),
      folder: z.string().describe('The full path of the destination folder.'),
    }),
  }),
  tool({
    name: TRASH_FILES_TOOL_NAME,
    description: [
      'Move files or folders of the owner to the Recycle Bin, where they can restore them.',
      'Before you call it, list exactly what you will delete and wait until the owner says yes.',
    ].join(' '),
    execute: async (input: { paths: string[] }) => act({ kind: 'trash', paths: input.paths }),
    parameters: z.object({ paths: z.array(z.string()).min(1).max(50).describe('Full paths of the files or folders to delete.') }),
  }),
]

export const fileTools = async () => Promise.all(tools)
