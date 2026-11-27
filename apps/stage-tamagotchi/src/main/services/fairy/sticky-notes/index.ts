import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'
import { BrowserWindow, screen } from 'electron'
import { array, number, object, optional, parse, string } from 'valibot'

import { electronStickyNote } from '../../../../shared/eventa'
import { FAIRY_DATA_DIR } from '../memory-files'
import { notePage } from './page'

/**
 * FAIRY: sticky notes that the character puts on the owner's screen, for example "drink water". The owner can drag
 * a note and closes it with its ×. Notes stay in `fairy-data/notes.json`, so they come back after a restart until
 * the owner closes them.
 */

const NOTES_FILE = join(FAIRY_DATA_DIR, 'notes.json')
const NOTE_SIZE = { width: 230, height: 150 }
const MAX_NOTES = 8
const MAX_TEXT = 300
const log = useLogg('fairy-sticky-notes').useGlobalConfig()

const notesSchema = array(object({
  id: string(),
  text: string(),
  by: string(),
  x: optional(number()),
  y: optional(number()),
}))
interface Note { id: string, text: string, by: string, x?: number, y?: number }

/** Adds a note from inside the main process, for example a prank of mischief mode. The service sets it up. */
let addNote: ((text: string, by: string) => Promise<void>) | undefined

export function addStickyNote(text: string, by: string) {
  return addNote?.(text, by) ?? Promise.resolve()
}

export function createStickyNotesService(params: { context: ReturnType<typeof createContext>['context'] }) {
  const storage = new Mutex()
  const open = new Map<string, BrowserWindow>()
  let notes: Note[] = []

  const save = () => storage.runExclusive(async () => {
    await mkdir(FAIRY_DATA_DIR, { recursive: true })
    await writeFile(NOTES_FILE, `${JSON.stringify(notes, null, 2)}\n`)
  }).catch(error => log.warn(`could not save the notes: ${errorMessageFrom(error)}`))

  /** New notes go in a row at the top right of the main screen, each a little lower and to the left. */
  function freeSpot(index: number) {
    const area = screen.getPrimaryDisplay().workArea
    return { x: area.x + area.width - NOTE_SIZE.width - 24 - (index % 4) * 40, y: area.y + 24 + index * 36 }
  }

  function show(note: Note) {
    const spot = note.x !== undefined && note.y !== undefined ? { x: note.x, y: note.y } : freeSpot(open.size)
    const window = new BrowserWindow({
      ...NOTE_SIZE,
      ...spot,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    })
    open.set(note.id, window)
    // A link in a note never opens a page in the note.
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.on('moved', () => {
      const [x, y] = window.getPosition()
      note.x = x
      note.y = y
      void save()
    })
    window.on('closed', () => {
      open.delete(note.id)
      notes = notes.filter(other => other.id !== note.id)
      void save()
    })
    window.once('ready-to-show', () => window.showInactive())
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(notePage(note.text, note.by))}`)
  }

  addNote = async (text, by) => {
    if (notes.length >= MAX_NOTES)
      return
    const note: Note = { id: randomUUID(), text: text.slice(0, MAX_TEXT), by: by.slice(0, 40) || 'AIRI' }
    notes.push(note)
    show(note)
    await save()
  }

  defineInvokeHandler(params.context, electronStickyNote, async ({ text, by }) => {
    const clean = text.trim().slice(0, MAX_TEXT)
    if (!clean)
      throw new Error('A note needs a text.')
    if (notes.length >= MAX_NOTES)
      throw new Error(`There are already ${MAX_NOTES} notes on the screen. Ask the owner to close some first.`)
    const note: Note = { id: randomUUID(), text: clean, by: by.trim().slice(0, 40) || 'AIRI' }
    notes.push(note)
    show(note)
    await save()
    return { count: notes.length }
  })

  // The notes from last time come back.
  void storage.runExclusive(async () => {
    if (!existsSync(NOTES_FILE))
      return
    notes = parse(notesSchema, JSON.parse(await readFile(NOTES_FILE, 'utf8')))
  }).then(() => notes.forEach(show)).catch(error => log.warn(`could not read the notes: ${errorMessageFrom(error)}`))

  return () => {
    // Closing AIRI keeps the notes. Only the owner's × removes one.
    for (const window of open.values()) {
      window.removeAllListeners('closed')
      window.destroy()
    }
    open.clear()
  }
}
