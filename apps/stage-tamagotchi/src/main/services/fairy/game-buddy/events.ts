/**
 * FAIRY: turns the event list of League's Live Client Data API into moments that matter to the owner.
 * Event names and fields: https://developer.riotgames.com/docs/lol#game-client-api_live-client-data-api
 */

export interface LiveEvent {
  EventID: number
  EventName: string
  EventTime?: number
  KillerName?: string
  VictimName?: string
  Assisters?: string[]
  KillStreak?: number
  Stolen?: string
  DragonType?: string
  AcingTeam?: string
  Recipient?: string
  Result?: string
}

export interface LivePlayer {
  championName?: string
  riotId?: string
  riotIdGameName?: string
  summonerName?: string
  team?: string
}

export type MomentKind
  = | 'gameStart' | 'gameKill' | 'gameDeath' | 'gameMultikill' | 'gameFirstBlood' | 'gameAce' | 'gameEnemyAce'
    | 'gameObjective' | 'gameEnemyObjective' | 'gameWin' | 'gameLose'

export interface Moment {
  kind: MomentKind
  /** What happened, in words for her notice. */
  says: string
  /** Big moments get a real comment from her. The rest only get a line from her file. */
  big: boolean
}

/** "Name#TAG" and "Name" both name the same player. */
function sameName(a: string | undefined, b: string | undefined) {
  const plain = (value: string) => value.split('#')[0].trim().toLowerCase()
  return !!a && !!b && plain(a) === plain(b)
}

const MULTIKILL = { 2: 'a double kill', 3: 'a triple kill', 4: 'a quadra kill', 5: 'a PENTAKILL' } as Record<number, string>
/** Deaths in a row without a kill or an assist, before she says something about it. */
export const DEATH_STREAK = 3

export class MatchReader {
  private deathsInARow = 0

  constructor(private readonly me: string, private readonly players: LivePlayer[]) {}

  private player(name: string | undefined) {
    return this.players.find(player => sameName(player.riotIdGameName, name) || sameName(player.summonerName, name) || sameName(player.riotId, name))
  }

  private get myPlayer() {
    return this.player(this.me)
  }

  private isMe(name: string | undefined) {
    return sameName(name, this.me) || (!!this.myPlayer && this.player(name) === this.myPlayer)
  }

  private onMyTeam(name: string | undefined) {
    const team = this.myPlayer?.team
    return !!team && this.player(name)?.team === team
  }

  /** The owner's champion, for the words of a notice. */
  private get champion() {
    return this.myPlayer?.championName ?? 'their champion'
  }

  /** The moments of one event, in order. Most events give none. */
  read(event: LiveEvent): Moment[] {
    const at = `at ${Math.floor((event.EventTime ?? 0) / 60)} minutes`
    switch (event.EventName) {
      case 'GameStart':
        return [{ kind: 'gameStart', says: `the owner's match started. They play ${this.champion}.`, big: false }]
      case 'ChampionKill': {
        if (this.isMe(event.VictimName)) {
          this.deathsInARow++
          const killer = this.player(event.KillerName)?.championName ?? event.KillerName ?? 'someone'
          const streak = this.deathsInARow === DEATH_STREAK
          return [{ kind: 'gameDeath', says: `the owner (${this.champion}) died to ${killer} ${at}${streak ? `, their ${DEATH_STREAK}rd death in a row` : ''}.`, big: streak }]
        }
        if (this.isMe(event.KillerName) || event.Assisters?.some(name => this.isMe(name)))
          this.deathsInARow = 0
        if (this.isMe(event.KillerName)) {
          const victim = this.player(event.VictimName)?.championName ?? event.VictimName ?? 'an enemy'
          return [{ kind: 'gameKill', says: `the owner (${this.champion}) killed ${victim} ${at}.`, big: false }]
        }
        return []
      }
      case 'Multikill':
        if (!this.isMe(event.KillerName) || !MULTIKILL[event.KillStreak ?? 0])
          return []
        return [{ kind: 'gameMultikill', says: `the owner (${this.champion}) got ${MULTIKILL[event.KillStreak!]} ${at}!`, big: (event.KillStreak ?? 0) >= 3 }]
      case 'FirstBlood':
        return this.isMe(event.Recipient) ? [{ kind: 'gameFirstBlood', says: `the owner (${this.champion}) got first blood.`, big: false }] : []
      case 'Ace': {
        const ours = event.AcingTeam === this.myPlayer?.team
        return [{ kind: ours ? 'gameAce' : 'gameEnemyAce', says: ours ? 'the owner\'s team killed the whole enemy team.' : 'the enemy team killed the owner\'s whole team.', big: false }]
      }
      case 'DragonKill':
      case 'BaronKill':
      case 'HeraldKill': {
        const name = event.EventName === 'DragonKill' ? `the ${event.DragonType ?? ''} dragon`.replace('  ', ' ') : event.EventName === 'BaronKill' ? 'Baron Nashor' : 'the Rift Herald'
        const ours = this.onMyTeam(event.KillerName)
        const stolen = event.Stolen === 'True'
        const byMe = this.isMe(event.KillerName)
        return [{
          kind: ours ? 'gameObjective' : 'gameEnemyObjective',
          says: `${ours ? (byMe ? 'the owner' : 'the owner\'s team') : 'the enemy team'} ${stolen ? 'STOLE' : 'took'} ${name}.`,
          big: stolen && ours,
        }]
      }
      case 'GameEnd':
        return [event.Result === 'Win'
          ? { kind: 'gameWin', says: `the owner WON their match with ${this.champion}!`, big: true }
          : { kind: 'gameLose', says: `the owner lost their match with ${this.champion}.`, big: true }]
      default:
        return []
    }
  }
}
