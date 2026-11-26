/** FAIRY: an app from the Windows Start menu, as `Get-StartApps` lists it. */
export interface StartApp {
  name: string
  appId: string
}

function score(name: string, query: string) {
  const lowerName = name.toLowerCase()
  if (lowerName === query)
    return 5
  const words = lowerName.split(/[\s\-_.]+/)
  // A whole word counts the same wherever it is, so "chrome" finds "Google Chrome".
  if (words.includes(query) || ` ${lowerName} `.includes(` ${query} `))
    return 4
  if (lowerName.startsWith(query))
    return 3
  if (words.some(word => word.startsWith(query)))
    return 2
  return lowerName.includes(query) ? 1 : 0
}

/**
 * Finds the Start menu apps that best match a spoken name, best first. Shorter names win a tie, so "Chrome" picks
 * "Google Chrome" before "Chrome Remote Desktop".
 *
 * @example
 * matchStartApps([{ name: 'Spotify', appId: 'x' }], 'spotify') // [{ name: 'Spotify', appId: 'x' }]
 */
export function matchStartApps(apps: readonly StartApp[], query: string): StartApp[] {
  return rankByName(apps, query, app => [app.name])
}

/**
 * Ranks items by how well one of their names matches a spoken name, best first. Items without a match are left out.
 * A tie goes to the shorter best name.
 */
export function rankByName<T>(items: readonly T[], query: string, names: (item: T) => string[]): T[] {
  const wanted = query.trim().toLowerCase()
  if (!wanted)
    return []
  return items
    .map((item) => {
      const scored = names(item).filter(Boolean).map(name => ({ name, score: score(name, wanted) }))
      const best = scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length)[0]
      return { item, score: best?.score ?? 0, length: best?.name.length ?? 0 }
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.length - b.length)
    .map(entry => entry.item)
}

/** FAIRY: a process with a window, as `Get-Process` lists it. */
export interface OpenWindow {
  id: number
  processName: string
  title: string
  product: string
}

/** Processes that the character must never close: Windows itself, AIRI, and the Claude app. */
const PROTECTED_PROCESSES = new Set(['explorer', 'electron', 'claude', 'textinputhost', 'shellexperiencehost', 'startmenuexperiencehost', 'searchhost', 'lockapp', 'dwm', 'winlogon', 'csrss', 'taskmgr'])

/**
 * Finds the open windows of the app that best matches a spoken name. All windows of that process name come back, so
 * every window of the app closes. Protected processes and `ownProcessIds` never match.
 *
 * @example
 * matchOpenWindows([{ id: 1, processName: 'Discord', title: 'Friends - Discord', product: 'Discord' }], 'discord', [])
 * // => [{ id: 1, ... }]
 */
export function matchOpenWindows(windows: readonly OpenWindow[], query: string, ownProcessIds: readonly number[]): OpenWindow[] {
  const closable = windows.filter(window => !PROTECTED_PROCESSES.has(window.processName.toLowerCase()) && !ownProcessIds.includes(window.id))
  const [best] = rankByName(closable, query, window => [window.product, window.processName, window.title])
  return best ? closable.filter(window => window.processName === best.processName) : []
}

/**
 * Makes a web address from what the character wrote. A bare domain gets `https://`. Only web addresses are allowed.
 *
 * @example
 * normalizeWebAddress('youtube.com') // 'https://youtube.com/'
 */
export function normalizeWebAddress(input: string): string {
  const trimmed = input.trim()
  const url = new URL(/^[a-z][\w+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`)
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('Only http and https addresses can be opened.')
  if (!url.hostname.includes('.') && url.hostname !== 'localhost')
    throw new Error(`"${input}" is not a web address.`)
  return url.href
}
