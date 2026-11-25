import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listMemoryFiles, removeMemoryFiles, saveMemoryFile } from './memory-files'

vi.mock('electron', () => ({
  app: { getAppPath: () => process.cwd(), getPath: () => tmpdir() },
  shell: { openPath: vi.fn() },
}))

describe('memory files', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fairy-memory-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('updates the same file when a fact changes', async () => {
    const first = await saveMemoryFile({ description: 'Main champion', body: 'Plays Lux mid.' }, dir)
    expect(first.id).toBe('main-champion')

    await saveMemoryFile({ id: first.id, description: 'Main champion', body: 'Plays Ahri mid (before: Lux).' }, dir)

    expect(await readdir(dir)).toEqual(['main-champion.md'])
    expect(await readFile(join(dir, 'main-champion.md'), 'utf8')).toBe('# Main champion\n\nPlays Ahri mid (before: Lux).\n')
  })

  it('reads a file that the user edited in a text editor', async () => {
    await saveMemoryFile({ description: 'Favourite food', body: 'Pizza.' }, dir)
    await writeFile(join(dir, 'favourite-food.md'), '# Favourite food\r\n\r\nSushi, not pizza.\r\n', 'utf8')

    const [entry] = await listMemoryFiles(dir)
    expect(entry).toMatchObject({ id: 'favourite-food', description: 'Favourite food', body: 'Sushi, not pizza.' })
  })

  it('moves a forgotten memory to .forgotten instead of deleting it', async () => {
    await saveMemoryFile({ description: 'Pet', body: 'A cat named Mochi.' }, dir)

    expect(await removeMemoryFiles(['pet', '../escape'], dir)).toEqual(['pet'])
    expect(await listMemoryFiles(dir)).toEqual([])
    const forgotten = await readdir(join(dir, '.forgotten'))
    expect(forgotten).toHaveLength(1)
    expect(forgotten[0]).toMatch(/^pet\..+\.md$/)
  })

  it('never writes outside the folder, even for an unsafe id', async () => {
    const entry = await saveMemoryFile({ id: '../../evil', description: 'Evil', body: 'x' }, dir)
    expect(entry.id).toBe('evil')
    expect(await readdir(dir)).toEqual(['evil.md'])
  })
})
