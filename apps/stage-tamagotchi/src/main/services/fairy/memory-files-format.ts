/**
 * FAIRY: the text format of one memory file, so the user can read and edit it in any text editor.
 *
 * ```
 * # Main champion
 *
 * Plays Ahri mid, mostly ranked in the evening.
 * ```
 *
 * The file name (without `.md`) is the memory's id, so an update rewrites the same file.
 */

export interface MemoryFile {
  id: string
  description: string
  body: string
}

/** Turns a title into a Windows-safe file name: "Main champion" becomes "main-champion". */
export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    // Drops the accents that NFKD split off, so "crème" becomes "creme".
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug || 'memory'
}

/** The first free id for `title`: "main-champion", then "main-champion-2", and so on. */
export function uniqueId(title: string, taken: ReadonlySet<string>): string {
  const base = slugify(title)
  if (!taken.has(base))
    return base
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`))
      return `${base}-${n}`
  }
}

/** Ids come from file names, so they must not reach outside the memory folder. */
export function isSafeId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(id)
}

export function serializeMemory(memory: Pick<MemoryFile, 'description' | 'body'>): string {
  const title = memory.description.replace(/\s+/g, ' ').trim()
  return `${title ? `# ${title}\n\n` : ''}${memory.body.trim()}\n`
}

/** Reads a file back. Without a `# Title` line, the title comes from the file name. */
export function parseMemory(id: string, text: string): MemoryFile {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const match = /^#[ \t]+(.+)\n?/.exec(normalized)
  const description = match ? match[1].trim() : id.replace(/-/g, ' ')
  const body = (match ? normalized.slice(match[0].length) : normalized).trim()
  return { id, description, body }
}
