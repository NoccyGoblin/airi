import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'

/**
 * FAIRY: rules for the file tools. The character works only inside the owner's own folders, such as Documents and
 * Downloads, and never opens anything that runs code.
 */

/** File types that run code when opened. The character never opens them. */
const RUNNABLE = new Set([
  '.exe',
  '.com',
  '.bat',
  '.cmd',
  '.ps1',
  '.psm1',
  '.vbs',
  '.vbe',
  '.js',
  '.jse',
  '.wsf',
  '.wsh',
  '.msi',
  '.msp',
  '.scr',
  '.lnk',
  '.url',
  '.reg',
  '.hta',
  '.cpl',
  '.jar',
  '.pif',
  '.appref-ms',
  '.application',
])

/** Folders that a search skips, because they hold app data instead of the owner's files. */
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'appdata', '$recycle.bin', 'system volume information'])

/** Whether opening a file of this name can run code. */
export function isRunnable(path: string) {
  return RUNNABLE.has(extname(path).toLowerCase())
}

/** Whether a search goes into a folder of this name. Hidden folders, such as `.cache`, are skipped too. */
export function isSearchedFolder(name: string) {
  return !name.startsWith('.') && !SKIPPED_FOLDERS.has(name.toLowerCase())
}

/**
 * Resolves `path` and checks that it is inside one of `roots`. A root itself counts as inside.
 *
 * @example
 * insideRoots('C:/Users/user/Documents/a.txt', ['C:/Users/user/Documents']) // 'C:\\Users\\user\\Documents\\a.txt' on Windows
 */
export function insideRoots(path: string, roots: readonly string[]): string {
  if (!isAbsolute(path))
    throw new Error(`"${path}" is not a full path. Use a path from find_files or list_folder.`)
  const full = resolve(path)
  const allowed = roots.some((root) => {
    const rest = relative(resolve(root), full)
    return rest === '' || (!rest.startsWith('..') && !isAbsolute(rest))
  })
  if (!allowed)
    throw new Error(`"${full}" is outside the owner's folders, so it cannot be used.`)
  return full
}

/**
 * Scores how well a file name matches a search. All words must occur. A name that starts with the search ranks
 * higher. Zero means no match.
 *
 * @example
 * fileNameScore('Resume 2026.pdf', 'resume') // 3
 */
export function fileNameScore(name: string, query: string) {
  const lowerName = name.toLowerCase()
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length || !words.every(word => lowerName.includes(word)))
    return 0
  const stem = basename(lowerName, extname(lowerName))
  if (stem === query.toLowerCase().trim())
    return 4
  if (lowerName.startsWith(words[0]))
    return 3
  return lowerName.split(/[\s\-_.()]+/).some(part => part.startsWith(words[0])) ? 2 : 1
}

/**
 * A free name in `folder` for `name`: the name itself, or "name (2).ext", "name (3).ext", and so on.
 *
 * @example
 * freeName('photo.jpg', new Set(['photo.jpg'])) // 'photo (2).jpg'
 */
export function freeName(name: string, taken: ReadonlySet<string>) {
  if (!taken.has(name.toLowerCase()) && !taken.has(name))
    return name
  const extension = extname(name)
  const stem = basename(name, extension)
  for (let number = 2; ; number++) {
    const candidate = `${stem} (${number})${extension}`
    if (!taken.has(candidate.toLowerCase()) && !taken.has(candidate))
      return candidate
  }
}

/** The destination path of a move into `folder`. */
export function moveTarget(source: string, folder: string, taken: ReadonlySet<string>) {
  return join(folder, freeName(basename(source), taken))
}
