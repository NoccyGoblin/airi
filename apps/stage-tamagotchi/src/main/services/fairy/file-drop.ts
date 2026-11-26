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
    try {
      const bytes = await readFile(path)
      return { data: bytes.toString('base64'), size: bytes.length }
    }
    catch (error) {
      // A OneDrive file that is only online cannot be read while OneDrive is not running. Windows then reports an
      // unknown read error, which tells the owner nothing.
      if ((error as NodeJS.ErrnoException).code === 'UNKNOWN')
        throw new Error('Windows could not open it. It is probably a OneDrive file that is only online while OneDrive is not running. Start OneDrive, or right-click the file and choose "Always keep on this device"')
      throw error
    }
  })
}
