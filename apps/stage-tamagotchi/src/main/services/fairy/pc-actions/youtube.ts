/**
 * FAIRY: finds videos on YouTube by search words, so the character can play a song or a video by name. It reads the
 * search page that YouTube sends to a browser. It needs no account and no key.
 */

export interface YouTubeVideo {
  id: string
  title: string
  channel?: string
}

const INITIAL_DATA = /var ytInitialData = (\{.+?\});<\/script>/s

interface Runs {
  runs?: { text?: string }[]
  simpleText?: string
}

interface VideoRenderer {
  videoId?: string
  title?: Runs
  ownerText?: Runs
}

function textOf(value?: Runs) {
  return value?.simpleText ?? value?.runs?.map(run => run.text ?? '').join('') ?? ''
}

/** Collects the video results in page order. Ads, shorts, and playlists use other renderers, so they fall out. */
function collectVideos(node: unknown, found: YouTubeVideo[], limit: number) {
  if (found.length >= limit || !node || typeof node !== 'object')
    return
  if (Array.isArray(node)) {
    for (const item of node)
      collectVideos(item, found, limit)
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'videoRenderer') {
      const video = value as VideoRenderer
      if (video.videoId && /^[\w-]{11}$/.test(video.videoId))
        found.push({ id: video.videoId, title: textOf(video.title), channel: textOf(video.ownerText) || undefined })
      continue
    }
    collectVideos(value, found, limit)
  }
}

/**
 * Reads the video results of a YouTube search page.
 *
 * @example
 * parseYouTubeResults('<script>var ytInitialData = {"a":[{"videoRenderer":{"videoId":"abcdefghijk","title":{"runs":[{"text":"Song"}]}}}]};</script>')
 * // => [{ id: 'abcdefghijk', title: 'Song', channel: undefined }]
 */
export function parseYouTubeResults(html: string, limit = 5): YouTubeVideo[] {
  const match = html.match(INITIAL_DATA)
  if (!match)
    return []
  const found: YouTubeVideo[] = []
  collectVideos(JSON.parse(match[1]), found, limit)
  return found
}

export function youTubeSearchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`
}

export function youTubeWatchUrl(id: string) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
}
