import { describe, expect, it } from 'vitest'

import { parseYouTubeResults, youTubeSearchUrl, youTubeWatchUrl } from './youtube'

function page(data: unknown) {
  return `<html><script nonce="x">var ytInitialData = ${JSON.stringify(data)};</script></html>`
}

describe('parseYouTubeResults', () => {
  it('lists videos in page order and skips ads and shorts', () => {
    const html = page({
      contents: [
        { adSlotRenderer: { videoId: 'aaaaaaaaaaa' } },
        { videoRenderer: { videoId: 'bbbbbbbbbbb', title: { runs: [{ text: 'First ' }, { text: 'song' }] }, ownerText: { runs: [{ text: 'Artist' }] } } },
        { reelShelfRenderer: { items: [{ shortsLockupViewModel: { videoId: 'ccccccccccc' } }] } },
        { videoRenderer: { videoId: 'ddddddddddd', title: { simpleText: 'Second' } } },
      ],
    })
    expect(parseYouTubeResults(html)).toEqual([
      { id: 'bbbbbbbbbbb', title: 'First song', channel: 'Artist' },
      { id: 'ddddddddddd', title: 'Second', channel: undefined },
    ])
  })

  it('stops at the limit and reads a page without results', () => {
    const many = page({ items: Array.from({ length: 9 }, (_, index) => ({ videoRenderer: { videoId: `video${index}abcde`, title: { simpleText: String(index) } } })) })
    expect(parseYouTubeResults(many, 2)).toHaveLength(2)
    expect(parseYouTubeResults('<html>no data</html>')).toEqual([])
  })
})

describe('youTube addresses', () => {
  it('encodes the search words and the video id', () => {
    expect(youTubeSearchUrl(' blinding lights & more ')).toBe('https://www.youtube.com/results?search_query=blinding%20lights%20%26%20more')
    expect(youTubeWatchUrl('abc_DEF-123')).toBe('https://www.youtube.com/watch?v=abc_DEF-123')
  })
})
