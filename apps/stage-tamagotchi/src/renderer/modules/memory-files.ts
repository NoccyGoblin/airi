import type { MemoryEntry } from '@proj-airi/stage-ui/types/memory'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { setMemoryFileBackend } from '@proj-airi/stage-ui/database/repos/memory.repo'

import {
  electronMemoryFilesChanged,
  electronMemoryFilesClear,
  electronMemoryFilesList,
  electronMemoryFilesOpenFolder,
  electronMemoryFilesRemove,
  electronMemoryFilesReplace,
  electronMemoryFilesSave,
} from '../../shared/eventa'

/**
 * FAIRY: keeps long-term memory in text files in <project>\fairy-data\memory, through the main process
 * (see `src/main/services/fairy/memory-files.ts`). Call once, before the memory store starts.
 */
export function useMemoryFiles() {
  const { context } = createContext(window.electron.ipcRenderer)
  const list = defineInvoke(context, electronMemoryFilesList)
  const save = defineInvoke(context, electronMemoryFilesSave)
  const remove = defineInvoke(context, electronMemoryFilesRemove)
  const clear = defineInvoke(context, electronMemoryFilesClear)
  const replace = defineInvoke(context, electronMemoryFilesReplace)
  const openFolder = defineInvoke(context, electronMemoryFilesOpenFolder)

  // Files have no character card: every memory is shared, so `persona` stays empty.
  setMemoryFileBackend({
    list: async () => (await list()) as MemoryEntry[],
    save: async input => (await save({ id: input.id, description: input.description, body: input.body })) as MemoryEntry,
    remove: ids => remove(ids),
    clear: async () => {
      await clear()
    },
    replace: async (entries) => {
      await replace(entries.map(entry => ({ description: entry.description, body: entry.body })))
    },
    onChange: callback => context.on(electronMemoryFilesChanged, () => callback()),
    openFolder: async () => {
      await openFolder()
    },
  })
}
