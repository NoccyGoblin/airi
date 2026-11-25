import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronWebSearch, electronWikipedia } from '../../../../shared/eventa'

/** FAIRY: Wikipedia and web search, run in the main process (see `src/main/services/fairy/web-knowledge.ts`). */

export const WIKIPEDIA_TOOL_NAME = 'wikipedia'
export const WEB_SEARCH_TOOL_NAME = 'web_search'

function createInvokers() {
  const { context } = createContext(window.electron.ipcRenderer)
  return {
    wikipedia: defineInvoke(context, electronWikipedia),
    webSearch: defineInvoke(context, electronWebSearch),
  }
}

let invokers: ReturnType<typeof createInvokers> | undefined
function getInvokers() {
  invokers ??= createInvokers()
  return invokers
}

async function safely(run: () => Promise<unknown>) {
  try {
    return JSON.stringify(await run())
  }
  catch (error) {
    return JSON.stringify({ ok: false, error: errorMessageFrom(error) ?? 'Unknown error', note: 'The lookup failed. Say so briefly; do not guess.' })
  }
}

const tools: Promise<Tool>[] = [
  tool({
    name: WIKIPEDIA_TOOL_NAME,
    description: [
      'Look up a topic on Wikipedia and get a short, reliable summary: people, places, animals, food, history, science,',
      'films, games and their lore. Use it for factual questions instead of answering from memory.',
      'Not for recent news, prices, opening hours, or step-by-step recipes; use web_search for those.',
    ].join(' '),
    execute: async (input: { query: string, language?: string }) => safely(() => getInvokers().wikipedia(input)),
    parameters: z.object({
      query: z.string().describe('The topic, for example "Eiffel Tower" or "Arcane (TV series)".'),
      language: z.string().optional().describe('Wikipedia language code, default "en". Use "nl" for Dutch pages.'),
    }),
  }),
  tool({
    name: WEB_SEARCH_TOOL_NAME,
    description: [
      'Search the web for current information and get a short answer with sources: recipes and cooking times, news,',
      'patch notes, game guides and builds, product info, prices, opening hours, anything that may have changed recently.',
      'Use it whenever the answer depends on recent or specific facts you are not sure about. Answer briefly from the',
      'result and mention the source name when it matters.',
    ].join(' '),
    execute: async (input: { query: string, recent?: boolean }) => safely(() => getInvokers().webSearch(input)),
    parameters: z.object({
      query: z.string().describe('A clear search query in English or the user\'s language.'),
      recent: z.boolean().optional().describe('true to prefer news from the last 30 days.'),
    }),
  }),
]

export const webKnowledgeTools = async () => Promise.all(tools)
