import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { LiveEvent, LivePlayer, Moment } from './events'

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { boolean, object, optional, parse } from 'valibot'

import { electronGameBuddy, electronGameBuddyNotice } from '../../../../shared/eventa'
import { bubbleSay } from '../activity-bubble'
import { loadReactions, pickLine } from '../desktop-life/reactions'
import { getLocalJson } from '../league'
import { FAIRY_DATA_DIR } from '../memory-files'
import { registerMode } from '../modes'
import { MatchReader } from './events'

/**
 * FAIRY: game buddy mode. During a League of Legends match she reacts to the owner's kills, deaths, objectives, and
 * the result. League tells this PC what happens through its Live Client Data API, so she needs no screenshots.
 *
 * - Every moment gets a free line in her bubble, from her reactions file.
 * - Big moments (a triple kill or more, a steal, a death streak, the end) also get a short real comment from her,
 *   at most one every few minutes, so a match does not eat the owner's credit.
 */

const SETTINGS_FILE = join(FAIRY_DATA_DIR, 'game-buddy.json')
const settingsSchema = object({ enabled: optional(boolean(), true), comments: optional(boolean(), true) })
const log = useLogg('fairy-game-buddy').useGlobalConfig()

/** Outside a match the API is closed, so a check is one refused connection. */
const IDLE_POLL_MS = 5_000
const MATCH_POLL_MS = 2_000
/** At most one real comment in this time. The end of a match always gets one. */
const COMMENT_GAP_MS = 3 * 60_000
const LINE_HOLD_MS = 3_000
/** A match she finds this early counts as starting now, so she wishes luck. Later, old events stay quiet. */
const FRESH_MATCH_SECONDS = 60

interface AllGameData {
  activePlayer?: { riotId?: string, riotIdGameName?: string, summonerName?: string }
  allPlayers?: LivePlayer[]
  events?: { Events?: LiveEvent[] }
  gameData?: { gameTime?: number }
}

export function createGameBuddyService(params: { context: ReturnType<typeof createContext>['context'] }) {
  let settings = { enabled: true, comments: true }
  let reader: MatchReader | undefined
  let lastEventId = -1
  let lastCommentAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  async function react(moment: Moment) {
    const line = pickLine(await loadReactions(), moment.kind)
    if (line)
      bubbleSay(line, LINE_HOLD_MS)
    const end = moment.kind === 'gameWin' || moment.kind === 'gameLose'
    if (!moment.big || !settings.comments || (!end && Date.now() - lastCommentAt < COMMENT_GAP_MS))
      return
    lastCommentAt = Date.now()
    params.context.emit(electronGameBuddyNotice, {
      text: `[Game buddy] In the owner's League of Legends match, ${moment.says} React out loud like a friend watching next to them: one short sentence, in character. Do not use tools.`,
    })
  }

  async function poll() {
    if (!settings.enabled)
      return
    let data: AllGameData
    try {
      data = await getLocalJson('/liveclientdata/allgamedata') as AllGameData
    }
    catch {
      if (reader)
        log.log('the League match ended')
      reader = undefined
      lastEventId = -1
      return
    }
    const events = data.events?.Events ?? []
    if (!reader) {
      const me = data.activePlayer?.riotId || data.activePlayer?.riotIdGameName || data.activePlayer?.summonerName || ''
      reader = new MatchReader(me, data.allPlayers ?? [])
      const fresh = (data.gameData?.gameTime ?? 0) < FRESH_MATCH_SECONDS
      lastEventId = fresh ? -1 : Math.max(-1, ...events.map(event => event.EventID))
      log.log(`watching a League match${fresh ? ' from the start' : ''}`)
    }
    for (const event of events) {
      if (event.EventID <= lastEventId)
        continue
      lastEventId = event.EventID
      for (const moment of reader.read(event))
        await react(moment).catch(error => log.warn(`could not react: ${errorMessageFrom(error)}`))
    }
  }

  function loop() {
    if (stopped)
      return
    void poll().finally(() => {
      if (!stopped)
        timer = setTimeout(loop, reader ? MATCH_POLL_MS : IDLE_POLL_MS)
    })
  }

  async function save() {
    await mkdir(FAIRY_DATA_DIR, { recursive: true })
    await writeFile(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`)
  }

  async function change(request: { enabled?: boolean, comments?: boolean }) {
    const next = { enabled: request.enabled ?? settings.enabled, comments: request.comments ?? settings.comments }
    if (next.enabled === settings.enabled && next.comments === settings.comments)
      return
    settings = next
    await save().catch(error => log.warn(`could not save game buddy mode: ${errorMessageFrom(error)}`))
    log.log(`game buddy mode ${settings.enabled ? 'on' : 'off'}, comments ${settings.comments ? 'on' : 'off'}`)
  }

  defineInvokeHandler(params.context, electronGameBuddy, async (request) => {
    await change(request ?? {})
    return { ...settings, inMatch: !!reader }
  })
  const unregisterModes = [
    registerMode('gameBuddy', { get: () => settings.enabled, set: enabled => change({ enabled }) }),
    registerMode('gameComments', { get: () => settings.comments, set: comments => change({ comments }) }),
  ]

  void (async () => {
    if (existsSync(SETTINGS_FILE))
      settings = parse(settingsSchema, JSON.parse(await readFile(SETTINGS_FILE, 'utf8')))
  })()
    .catch(error => log.warn(`could not read game buddy mode: ${errorMessageFrom(error)}`))
    .finally(loop)

  return () => {
    unregisterModes.forEach(unregister => unregister())
    stopped = true
    clearTimeout(timer)
  }
}
