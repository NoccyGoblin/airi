import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { electronLeagueLiveGame, electronLeagueLookup } from '../../../../shared/eventa'

/**
 * FAIRY: League of Legends tools, so the companion answers League questions from Riot's data instead of memory.
 * The main process does the work (see `src/main/services/fairy/league.ts`).
 */

export const LEAGUE_LIVE_GAME_TOOL_NAME = 'league_live_game'
export const LEAGUE_LOOKUP_TOOL_NAME = 'league_lookup'

function createInvokers() {
  const { context } = createContext(window.electron.ipcRenderer)
  return {
    liveGame: defineInvoke(context, electronLeagueLiveGame),
    lookup: defineInvoke(context, electronLeagueLookup),
  }
}

let invokers: ReturnType<typeof createInvokers> | undefined
function getInvokers() {
  invokers ??= createInvokers()
  return invokers
}

const tools: Promise<Tool>[] = [
  tool({
    name: LEAGUE_LIVE_GAME_TOOL_NAME,
    description: [
      'Get the exact state of the user\'s League of Legends match that is running right now: the user\'s champion, level, gold,',
      'items, runes, abilities and stats, every ally and enemy with champion, KDA, CS, items, summoner spells and keystone,',
      'and recent events like dragons and kills. Use this for any question about the current League game, such as what to buy,',
      'what the enemy has, or who is fed, instead of guessing from a screenshot. Returns `inGame: false` when no match runs.',
    ].join(' '),
    execute: async () => JSON.stringify(await getInvokers().liveGame()),
    parameters: z.object({}),
  }),
  tool({
    name: LEAGUE_LOOKUP_TOOL_NAME,
    description: [
      'Look up official League of Legends data for the newest patch from Riot: an item (stats, passive, cost, build path),',
      'a champion (passive and Q/W/E/R abilities with cooldowns and costs), a rune, or a summoner spell.',
      'Always use this before stating League numbers, item effects, or ability details; your own memory is out of date.',
      'Typos are fine. Returns the patch version, so you can mention it.',
    ].join(' '),
    execute: async (input: { name: string, kind: 'any' | 'item' | 'champion' | 'rune' | 'summoner_spell' }) =>
      JSON.stringify(await getInvokers().lookup(input)),
    parameters: z.object({
      name: z.string().describe('Name of the item, champion, rune, or summoner spell in English, for example "Infinity Edge", "Ahri", "Conqueror", "Flash".'),
      kind: z.enum(['any', 'item', 'champion', 'rune', 'summoner_spell']).describe('What to look for. Use "any" when unsure.'),
    }),
  }),
]

export const leagueTools = async () => Promise.all(tools)
