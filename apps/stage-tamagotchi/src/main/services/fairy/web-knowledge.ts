import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { WebSearchRequest, WikipediaRequest } from '../../../shared/eventa'

import process from 'node:process'

import { defineInvokeHandler } from '@moeru/eventa'

import { electronWebSearch, electronWikipedia } from '../../../shared/eventa'

/**
 * FAIRY: up-to-date knowledge for the companion.
 *
 * - Wikipedia: free, no account. Reliable facts about people, places, history, science, game lore.
 * - Web search: Tavily (https://tavily.com), free plan of 1,000 searches a month. It needs a key in the user
 *   environment variable `FAIRY_TAVILY_API_KEY`. Without the key the tool says so and nothing is sent.
 *
 * Privacy: only the search words go out. No user data is added to requests, and the User-Agent is generic.
 */

const USER_AGENT = 'FairyCompanion/0.1 (personal desktop assistant)'
const TIMEOUT_MS = 10_000

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, ...init?.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok)
    throw new Error(`${new URL(url).host} returned ${res.status}`)
  return await res.json() as T
}

// -- Wikipedia --

interface WikiSearch { pages: { key: string, title: string, description?: string | null }[] }
interface WikiSummary { title: string, description?: string, extract?: string, content_urls?: { desktop?: { page?: string } }, type?: string }

export async function lookupWikipedia(input: WikipediaRequest) {
  const lang = /^[a-z]{2,3}$/.test(input.language ?? '') ? input.language! : 'en'
  const search = await getJson<WikiSearch>(`https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(input.query)}&limit=3`)
  if (!search.pages.length)
    return { found: false, note: `Wikipedia has no page for "${input.query}". Do not guess.` }

  const summary = await getJson<WikiSummary>(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(search.pages[0].key)}`)
  return {
    found: true,
    title: summary.title,
    description: summary.description,
    summary: summary.extract,
    url: summary.content_urls?.desktop?.page,
    ...(summary.type === 'disambiguation' ? { note: 'This name has several meanings. Ask the user which one they mean.' } : {}),
    otherPages: search.pages.slice(1).map(page => page.title),
  }
}

// -- Web search (Tavily) --

interface TavilyResponse {
  answer?: string
  results?: { title: string, url: string, content: string, published_date?: string }[]
}

export function tavilyKey(): string | undefined {
  return process.env.FAIRY_TAVILY_API_KEY?.trim() || undefined
}

export async function searchWeb(input: WebSearchRequest) {
  const key = tavilyKey()
  if (!key) {
    return {
      ok: false,
      note: 'Web search is not set up yet: the user has to add a free Tavily key as the Windows user environment variable FAIRY_TAVILY_API_KEY and restart the app. Tell them that, briefly. Do not guess the answer.',
    }
  }

  // A plain "latest patch notes" search returned pages from years ago. Naming the month and year finds the current ones.
  const query = input.recent && !/\b20\d{2}\b/.test(input.query)
    ? `${input.query} ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
    : input.query

  const data = await getJson<TavilyResponse>('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      include_answer: true,
      max_results: 5,
      ...(input.recent ? { topic: 'news', days: 30 } : {}),
    }),
  })

  return {
    ok: true,
    answer: data.answer,
    sources: (data.results ?? []).map(result => ({
      title: result.title,
      url: result.url,
      published: result.published_date,
      snippet: result.content.slice(0, 600),
    })),
  }
}

export function createWebKnowledgeService(params: { context: ReturnType<typeof createContext>['context'] }): void {
  defineInvokeHandler(params.context, electronWikipedia, input => lookupWikipedia(input))
  defineInvokeHandler(params.context, electronWebSearch, input => searchWeb(input))
}
