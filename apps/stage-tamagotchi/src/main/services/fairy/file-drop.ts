import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'

import { defineInvokeHandler } from '@moeru/eventa'

import { electronReadDroppedFile } from '../../../shared/eventa'

/**
 * FAIRY: reads a file that the owner dropped on the character. Chromium refuses a OneDrive file that downloads while
 * it reads ("could not be read"), and a read from disk downloads it first. Only the kinds she can read, and only
 * files up to a size she can use.
 */

const READABLE = new Set(['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.log', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.py', '.java', '.c', '.h', '.cpp', '.hpp', '.cs', '.go', '.rs', '.rb', '.php', '.lua', '.sh', '.ps1', '.bat', '.sql', '.srt', '.vtt'])
const MAX_BYTES = 25 * 1024 * 1024

export function createFileDropService(params: { context: ReturnType<typeof createContext>['context'] }) {
  defineInvokeHandler(params.context, electronReadDroppedFile, async ({ path }) => {
    if (!READABLE.has(extname(path).toLowerCase()))
      throw new Error('She cannot read this kind of file.')
    const info = await stat(path)
    if (!info.isFile())
      throw new Error('That is not a file.')
    if (info.size > MAX_BYTES)
      throw new Error('The file is too big.')
    const bytes = await readFile(path)
    return { data: bytes.toString('base64'), size: bytes.length }
  })
}
