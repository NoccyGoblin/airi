import type { MemoryEntry, MemoryWrite } from '../../types/memory'

import { prefixStorage } from 'unstorage'
import { v7 as uuidv7 } from 'uuid'

import { listRawItems, storage } from '../storage'

/** A removed entry stays as a tombstone with the time of the removal, so a later sync can remove it on other devices. */
interface MemoryTombstone {
  id: string
  updatedAt: number
  deleted: true
}

type StoredMemory = MemoryEntry | MemoryTombstone

const records = prefixStorage(storage, 'memory')

/**
 * Runs one write. Every write of every window takes this lock, so a write that reads the stored records sees every
 * write before it, and no other write lands between its read and its save.
 */
function write<T>(run: () => Promise<T>) {
  return navigator.locks.request('airi:memory', run)
}

/** The stored entry with this id, or undefined when it is missing or removed. */
async function storedEntry(id: string) {
  const stored = await records.getItemRaw<StoredMemory>(id)
  return stored && !('deleted' in stored) ? stored : undefined
}

/**
 * FAIRY: memory kept as files that the user can read and edit. The desktop app sets it at start-up; then every entry
 * lives in a file, is shared by every character, and a run may update or forget any entry.
 */
export interface MemoryFileBackend {
  list: () => Promise<MemoryEntry[]>
  /** Rewrites the entry with this id when it exists, otherwise adds a new one. */
  save: (input: MemoryWrite) => Promise<MemoryEntry>
  /** Resolves to the ids that were removed. */
  remove: (ids: string[]) => Promise<string[]>
  clear: () => Promise<void>
  replace: (entries: MemoryWrite[]) => Promise<void>
  /** Calls back when an entry changes outside the app, for example in a text editor. Returns a stop function. */
  onChange: (callback: () => void) => () => void
  openFolder?: () => Promise<void>
}

let fileBackend: MemoryFileBackend | undefined

/** FAIRY: switches long-term memory to files. Call before the memory store starts. */
export function setMemoryFileBackend(backend: MemoryFileBackend) {
  fileBackend = backend
}

export function getMemoryFileBackend() {
  return fileBackend
}

/** FAIRY: moves the entries from IndexedDB into the files once, then clears IndexedDB. */
export async function moveRecordsToFiles() {
  if (!fileBackend)
    return
  const stored = (await listRawItems<StoredMemory>(records, ''))
    .map(([, record]) => record)
    .filter((record): record is MemoryEntry => !('deleted' in record))
  if (!stored.length)
    return
  for (const entry of stored)
    await fileBackend.save({ description: entry.description, body: entry.body })
  await write(() => records.clear())
}

/** Long-term memory on this device, one record for each entry, keyed by the entry id. */
export const memoryRepo = {
  /** The entries that are not removed, oldest change first. */
  async list() {
    if (fileBackend)
      return (await fileBackend.list()).sort((left, right) => left.updatedAt - right.updatedAt)
    const entries = (await listRawItems<StoredMemory>(records, ''))
      .map(([, record]) => record)
      .filter((record): record is MemoryEntry => !('deleted' in record))
    return entries.sort((left, right) => left.updatedAt - right.updatedAt)
  },
  /** Adds entries as they are, with their ids. Only the move from localStorage uses it. */
  async add(entries: MemoryEntry[]) {
    if (fileBackend) {
      for (const entry of entries)
        await fileBackend.save({ description: entry.description, body: entry.body })
      return
    }
    await write(() => Promise.all(entries.map(entry => records.setItemRaw<MemoryEntry>(entry.id, entry))))
  },
  /** Replaces the stored entries as one operation against other windows' writes. */
  async replace(entries: MemoryEntry[]) {
    if (fileBackend)
      return fileBackend.replace(entries.map(({ description, body }) => ({ description, body })))
    await write(async () => {
      await records.clear()
      await Promise.all(entries.map(entry => records.setItem<MemoryEntry>(entry.id, entry)))
    })
  },
  /**
   * Saves a fact on the card of `persona`, on the stored records. An id of the card's own stored entry replaces that
   * entry. Any other id, for example of a general or a removed entry, adds a new entry with a new id.
   * Resolves to the stored entry.
   */
  async write(input: MemoryWrite, persona: string, updatedAt: number) {
    // FAIRY: with files, every entry is shared, and an existing id updates that file in place.
    if (fileBackend)
      return fileBackend.save(input)
    return write(async () => {
      const own = input.id ? await storedEntry(input.id) : undefined
      const entry: MemoryEntry = {
        id: own?.persona === persona ? own.id : uuidv7(),
        description: input.description,
        body: input.body,
        persona,
        updatedAt,
      }
      await records.setItemRaw<MemoryEntry>(entry.id, entry)
      return entry
    })
  },
  /**
   * FAIRY: the owner edits an entry, or adds one, in Settings. An edited entry keeps its card. A new entry is general,
   * so every character knows it. Resolves to the stored entry.
   */
  async ownerSave(input: MemoryWrite, updatedAt: number) {
    if (fileBackend)
      return fileBackend.save(input)
    return write(async () => {
      const stored = input.id ? await storedEntry(input.id) : undefined
      const entry: MemoryEntry = {
        id: stored?.id ?? uuidv7(),
        description: input.description,
        body: input.body,
        ...(stored?.persona ? { persona: stored.persona } : {}),
        updatedAt,
      }
      await records.setItemRaw<MemoryEntry>(entry.id, entry)
      return entry
    })
  },
  /** Makes a card's stored entry general. Resolves to whether it changed. */
  async makeGeneral(id: string, updatedAt: number) {
    if (fileBackend)
      return false
    return write(async () => {
      const stored = await storedEntry(id)
      if (!stored?.persona)
        return false
      const { persona: _card, ...general } = stored
      await records.setItemRaw<MemoryEntry>(id, { ...general, updatedAt })
      return true
    })
  },
  /**
   * Replaces the entry with a tombstone when it still belongs to the card of `persona`. General memories belong to the
   * owner, so a run cannot forget them. Resolves to whether it removed the entry.
   */
  async forget(id: string, persona: string, updatedAt: number) {
    // FAIRY: with files, the companion may forget any entry; it moves to the `.forgotten` folder.
    if (fileBackend)
      return (await fileBackend.remove([id])).length > 0
    return write(async () => {
      if ((await storedEntry(id))?.persona !== persona)
        return false
      await records.setItemRaw<MemoryTombstone>(id, { id, updatedAt, deleted: true })
      return true
    })
  },
  /** Replaces each entry with a tombstone, whoever owns it. Only the owner removes entries this way, in Settings. */
  async remove(ids: string[], updatedAt: number) {
    if (fileBackend) {
      await fileBackend.remove(ids)
      return
    }
    await write(() => Promise.all(ids.map(id => records.setItemRaw<MemoryTombstone>(id, { id, updatedAt, deleted: true }))))
  },
  /** Deletes every record, tombstones too. Only deleting all data uses it. */
  async clear() {
    if (fileBackend)
      return fileBackend.clear()
    await write(() => records.clear())
  },
}
