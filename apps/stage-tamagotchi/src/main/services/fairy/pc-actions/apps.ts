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
  const wanted = query.trim().toLowerCase()
  if (!wanted)
    return []
  return apps
    .map(app => ({ app, score: score(app.name, wanted) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.app.name.length - b.app.name.length)
    .map(entry => entry.app)
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
