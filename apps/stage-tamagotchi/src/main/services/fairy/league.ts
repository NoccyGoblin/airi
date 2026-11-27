import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { LeagueLookupRequest } from '../../../shared/eventa'

import { request } from 'node:https'

import { defineInvokeHandler } from '@moeru/eventa'

import { electronLeagueLiveGame, electronLeagueLookup } from '../../../shared/eventa'

/**
 * FAIRY: League of Legends data for the companion, so it answers from facts instead of memory.
 *
 * - Live game: Riot's Live Client Data API. The League client serves it on this PC at https://127.0.0.1:2999 only
 *   while a match runs. It has a self-signed certificate, so the request skips certificate checks for that one local
 *   address and nothing else.
 * - Static data: Riot's official Data Dragon (ddragon.leagueoflegends.com), always for the newest patch.
 *   Source: https://developer.riotgames.com/docs/lol
 */

const LIVE_HOST = '127.0.0.1'
const LIVE_PORT = 2999
const LIVE_TIMEOUT_MS = 2500
const DDRAGON = 'https://ddragon.leagueoflegends.com'
/** Data Dragon changes once per patch, about every two weeks. Six hours keeps it fresh without refetching each call. */
const DDRAGON_CACHE_MS = 6 * 60 * 60 * 1000

// -- Live game --

export function getLocalJson(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: LIVE_HOST,
      port: LIVE_PORT,
      path,
      method: 'GET',
      // Riot's local game server uses a self-signed certificate. Only this fixed loopback address is contacted.
      rejectUnauthorized: false,
      timeout: LIVE_TIMEOUT_MS,
    }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => body += chunk)
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400)
          return reject(new Error(`Live client returned ${res.statusCode}`))
        try {
          resolve(JSON.parse(body))
        }
        catch (error) {
          reject(error)
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('Live client timed out')))
    req.on('error', reject)
    req.end()
  })
}

interface LivePlayer {
  championName?: string
  riotId?: string
  riotIdGameName?: string
  summonerName?: string
  team?: string
  position?: string
  level?: number
  isDead?: boolean
  respawnTimer?: number
  scores?: { kills?: number, deaths?: number, assists?: number, creepScore?: number, wardScore?: number }
  items?: { displayName?: string, count?: number, slot?: number }[]
  summonerSpells?: { summonerSpellOne?: { displayName?: string }, summonerSpellTwo?: { displayName?: string } }
  runes?: { keystone?: { displayName?: string } }
}

interface LiveGameData {
  activePlayer?: {
    riotId?: string
    riotIdGameName?: string
    summonerName?: string
    level?: number
    currentGold?: number
    championStats?: Record<string, number>
    abilities?: Record<string, { displayName?: string, abilityLevel?: number }>
    fullRunes?: { keystone?: { displayName?: string }, primaryRuneTree?: { displayName?: string }, secondaryRuneTree?: { displayName?: string } }
  }
  allPlayers?: LivePlayer[]
  events?: { Events?: { EventName?: string, EventTime?: number, KillerName?: string, VictimName?: string, DragonType?: string }[] }
  gameData?: { gameMode?: string, gameTime?: number, mapName?: string }
}

function summarizePlayer(player: LivePlayer) {
  return {
    champion: player.championName,
    position: player.position || undefined,
    level: player.level,
    kda: `${player.scores?.kills ?? 0}/${player.scores?.deaths ?? 0}/${player.scores?.assists ?? 0}`,
    cs: player.scores?.creepScore,
    dead: player.isDead ? `yes, respawns in ${Math.ceil(player.respawnTimer ?? 0)}s` : undefined,
    items: (player.items ?? [])
      .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
      .map(item => (item.count ?? 1) > 1 ? `${item.displayName} x${item.count}` : item.displayName),
    summonerSpells: [player.summonerSpells?.summonerSpellOne?.displayName, player.summonerSpells?.summonerSpellTwo?.displayName].filter(Boolean),
    keystone: player.runes?.keystone?.displayName,
  }
}

function playerId(player: { riotId?: string, riotIdGameName?: string, summonerName?: string } | undefined) {
  return player?.riotId || player?.riotIdGameName || player?.summonerName || ''
}

/** A compact view of the running match, or `{ inGame: false }` when no match runs. */
export async function readLiveGame() {
  let data: LiveGameData
  try {
    data = await getLocalJson('/liveclientdata/allgamedata') as LiveGameData
  }
  catch {
    return { inGame: false, note: 'No League of Legends match is running on this PC right now (the live game data is only available during a match).' }
  }

  const players = data.allPlayers ?? []
  const meId = playerId(data.activePlayer)
  const me = players.find(p => playerId(p) === meId || p.riotIdGameName === data.activePlayer?.riotIdGameName)
  const myTeam = me?.team
  const stats = data.activePlayer?.championStats ?? {}

  return {
    inGame: true,
    gameMode: data.gameData?.gameMode,
    gameTime: `${Math.floor((data.gameData?.gameTime ?? 0) / 60)}m ${Math.floor((data.gameData?.gameTime ?? 0) % 60)}s`,
    you: me
      ? {
          ...summarizePlayer(me),
          gold: Math.floor(data.activePlayer?.currentGold ?? 0),
          runes: [data.activePlayer?.fullRunes?.primaryRuneTree?.displayName, data.activePlayer?.fullRunes?.secondaryRuneTree?.displayName].filter(Boolean),
          abilities: Object.fromEntries(Object.entries(data.activePlayer?.abilities ?? {})
            .map(([key, ability]) => [key, `${ability.displayName}${ability.abilityLevel !== undefined ? ` (rank ${ability.abilityLevel})` : ''}`])),
          stats: {
            attackDamage: Math.round(stats.attackDamage ?? 0),
            abilityPower: Math.round(stats.abilityPower ?? 0),
            armor: Math.round(stats.armor ?? 0),
            magicResist: Math.round(stats.magicResist ?? 0),
            health: `${Math.round(stats.currentHealth ?? 0)}/${Math.round(stats.maxHealth ?? 0)}`,
            attackSpeed: Number((stats.attackSpeed ?? 0).toFixed(2)),
            moveSpeed: Math.round(stats.moveSpeed ?? 0),
          },
        }
      : undefined,
    yourTeam: players.filter(p => p.team === myTeam && p !== me).map(summarizePlayer),
    enemyTeam: players.filter(p => p.team !== myTeam).map(summarizePlayer),
    recentEvents: (data.events?.Events ?? []).slice(-8).map(event => ({
      event: event.EventName,
      at: `${Math.floor((event.EventTime ?? 0) / 60)}m`,
      ...(event.KillerName ? { killer: event.KillerName } : {}),
      ...(event.VictimName ? { victim: event.VictimName } : {}),
      ...(event.DragonType ? { dragon: event.DragonType } : {}),
    })),
  }
}

// -- Data Dragon (official static data, newest patch) --

interface DDragonData {
  version: string
  items: Record<string, { name: string, plaintext?: string, description?: string, gold?: { total?: number, sell?: number }, from?: string[], into?: string[], tags?: string[], maps?: Record<string, boolean>, inStore?: boolean }>
  champions: Record<string, { id: string, name: string, title: string, tags: string[] }>
  runes: { name: string, key: string, slots: { runes: { name: string, shortDesc: string, longDesc: string }[] }[] }[]
  spells: Record<string, { name: string, description: string, cooldownBurn?: string }>
  fetchedAt: number
}

let ddragonCache: Promise<DDragonData> | undefined

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok)
    throw new Error(`Data Dragon returned ${res.status} for ${url}`)
  return await res.json() as T
}

async function loadDDragon(): Promise<DDragonData> {
  const versions = await getJson<string[]>(`${DDRAGON}/api/versions.json`)
  const version = versions[0]
  const base = `${DDRAGON}/cdn/${version}/data/en_US`
  const [items, champions, runes, spells] = await Promise.all([
    getJson<{ data: DDragonData['items'] }>(`${base}/item.json`),
    getJson<{ data: DDragonData['champions'] }>(`${base}/champion.json`),
    getJson<DDragonData['runes']>(`${base}/runesReforged.json`),
    getJson<{ data: DDragonData['spells'] }>(`${base}/summoner.json`),
  ])
  return { version, items: items.data, champions: champions.data, runes, spells: spells.data, fetchedAt: Date.now() }
}

async function getDDragon(): Promise<DDragonData> {
  const cached = await ddragonCache?.catch(() => undefined)
  if (!cached || Date.now() - cached.fetchedAt > DDRAGON_CACHE_MS) {
    ddragonCache = loadDDragon()
    return ddragonCache
  }
  return cached
}

/** Turns Riot's HTML-like descriptions into plain text. */
function plain(text: string | undefined): string {
  return (text ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:li|stats|passive|active|mainText)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
}

function norm(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
}

/** Levenshtein distance, for typos like "infinty edge". */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]
}

interface Candidate { kind: 'item' | 'champion' | 'rune' | 'summoner_spell', name: string, key: string }

function bestMatches(query: string, allCandidates: Candidate[]): Candidate[] {
  const q = norm(query)
  if (!q)
    return []
  // Some hidden Data Dragon items have no name. An empty name would "contain" every query.
  const candidates = allCandidates.filter(c => norm(c.name).length > 0)
  const exact = candidates.filter(c => norm(c.name) === q)
  if (exact.length)
    return exact
  const contains = candidates.filter(c => norm(c.name).includes(q) || q.includes(norm(c.name)))
  if (contains.length)
    return contains.slice(0, 5)
  const scored = candidates
    .map(c => ({ c, d: distance(q, norm(c.name)) }))
    .filter(({ c, d }) => d <= Math.max(2, Math.floor(norm(c.name).length / 4)))
    .sort((a, b) => a.d - b.d)
  return scored.slice(0, 3).map(({ c }) => c)
}

interface ChampionDetail {
  name: string
  title: string
  tags: string[]
  partype: string
  passive: { name: string, description: string }
  spells: { name: string, description: string, cooldownBurn: string, costBurn: string }[]
  allytips?: string[]
  enemytips?: string[]
}

async function describeChampion(data: DDragonData, key: string) {
  const detail = (await getJson<{ data: Record<string, ChampionDetail> }>(`${DDRAGON}/cdn/${data.version}/data/en_US/champion/${key}.json`)).data[key]
  return {
    kind: 'champion',
    name: detail.name,
    title: detail.title,
    roles: detail.tags,
    resource: detail.partype,
    passive: { name: detail.passive.name, description: plain(detail.passive.description) },
    abilities: detail.spells.map((spell, index) => ({
      key: ['Q', 'W', 'E', 'R'][index],
      name: spell.name,
      description: plain(spell.description),
      cooldown: spell.cooldownBurn,
      cost: spell.costBurn,
    })),
    allyTips: detail.allytips?.slice(0, 3),
    enemyTips: detail.enemytips?.slice(0, 3),
  }
}

function describeItem(data: DDragonData, key: string) {
  const item = data.items[key]
  const nameOf = (id: string) => data.items[id]?.name ?? id
  return {
    kind: 'item',
    name: item.name,
    summary: item.plaintext || undefined,
    description: plain(item.description),
    cost: item.gold?.total,
    sellsFor: item.gold?.sell,
    buildsFrom: item.from?.map(nameOf),
    buildsInto: item.into?.map(nameOf),
    tags: item.tags,
  }
}

function describeRune(data: DDragonData, name: string) {
  for (const tree of data.runes) {
    for (const slot of tree.slots) {
      const rune = slot.runes.find(r => r.name === name)
      if (rune)
        return { kind: 'rune', name: rune.name, tree: tree.name, description: plain(rune.longDesc) }
    }
  }
  return undefined
}

function describeSpell(data: DDragonData, key: string) {
  const spell = data.spells[key]
  return { kind: 'summoner_spell', name: spell.name, description: plain(spell.description), cooldown: spell.cooldownBurn }
}

/** Looks up an item, champion, rune, or summoner spell by name in the newest patch. */
export async function lookupLeague(input: LeagueLookupRequest) {
  const data = await getDDragon()
  // Items on the Summoner's Rift (map 11) and in the store come first, so the regular version wins over mode copies.
  const items = Object.entries(data.items)
    .filter(([, item]) => item.inStore !== false)
    .sort(([, a], [, b]) => Number(!!b.maps?.['11']) - Number(!!a.maps?.['11']))
  const candidates: Candidate[] = [
    ...(input.kind === 'any' || input.kind === 'item' ? items.map(([key, item]) => ({ kind: 'item' as const, name: item.name, key })) : []),
    ...(input.kind === 'any' || input.kind === 'champion' ? Object.values(data.champions).map(c => ({ kind: 'champion' as const, name: c.name, key: c.id })) : []),
    ...(input.kind === 'any' || input.kind === 'rune' ? data.runes.flatMap(tree => tree.slots.flatMap(slot => slot.runes.map(r => ({ kind: 'rune' as const, name: r.name, key: r.name })))) : []),
    ...(input.kind === 'any' || input.kind === 'summoner_spell' ? Object.entries(data.spells).map(([key, s]) => ({ kind: 'summoner_spell' as const, name: s.name, key })) : []),
  ]

  // The same name can exist once per mode. Keep the first, which is the Summoner's Rift version.
  const seen = new Set<string>()
  const matches = bestMatches(input.name, candidates).filter((c) => {
    const id = `${c.kind}:${norm(c.name)}`
    if (seen.has(id))
      return false
    seen.add(id)
    return true
  })

  if (!matches.length)
    return { patch: data.version, found: false, note: `Nothing named "${input.name}" in patch ${data.version}. Do not guess; ask the user to check the name.` }

  const results = await Promise.all(matches.slice(0, 2).map((m) => {
    switch (m.kind) {
      case 'champion': return describeChampion(data, m.key)
      case 'item': return describeItem(data, m.key)
      case 'rune': return describeRune(data, m.key)
      case 'summoner_spell': return describeSpell(data, m.key)
    }
    return undefined
  }))
  return {
    patch: data.version,
    found: true,
    results,
    ...(matches.length > 2 ? { otherMatches: matches.slice(2).map(m => m.name) } : {}),
  }
}

export function createLeagueService(params: { context: ReturnType<typeof createContext>['context'] }): void {
  defineInvokeHandler(params.context, electronLeagueLiveGame, () => readLiveGame())
  defineInvokeHandler(params.context, electronLeagueLookup, input => lookupLeague(input))
}
