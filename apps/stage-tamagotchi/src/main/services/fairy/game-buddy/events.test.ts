import { describe, expect, it } from 'vitest'

import { DEATH_STREAK, MatchReader } from './events'

const players = [
  { championName: 'Ahri', riotIdGameName: 'Owner', riotId: 'Owner#EUW', team: 'ORDER' },
  { championName: 'Leona', riotIdGameName: 'Friend', team: 'ORDER' },
  { championName: 'Zed', riotIdGameName: 'Enemy', team: 'CHAOS' },
]

function reader() {
  return new MatchReader('Owner#EUW', players)
}

describe('matchReader', () => {
  it('sees the owner\'s kills and deaths', () => {
    const match = reader()
    expect(match.read({ EventID: 1, EventName: 'ChampionKill', KillerName: 'Owner', VictimName: 'Enemy', EventTime: 125 })).toEqual([
      { kind: 'gameKill', says: 'the owner (Ahri) killed Zed at 2 minutes.', big: false },
    ])
    expect(match.read({ EventID: 2, EventName: 'ChampionKill', KillerName: 'Enemy', VictimName: 'Owner' })[0]).toMatchObject({ kind: 'gameDeath', big: false })
  })

  it('ignores kills that do not involve the owner', () => {
    expect(reader().read({ EventID: 1, EventName: 'ChampionKill', KillerName: 'Friend', VictimName: 'Enemy' })).toEqual([])
  })

  it('makes a death streak a big moment, and a kill or an assist resets it', () => {
    const match = reader()
    const die = (id: number) => match.read({ EventID: id, EventName: 'ChampionKill', KillerName: 'Enemy', VictimName: 'Owner' })[0]
    die(1)
    match.read({ EventID: 2, EventName: 'ChampionKill', KillerName: 'Friend', VictimName: 'Enemy', Assisters: ['Owner'] })
    for (let id = 3; id < 3 + DEATH_STREAK - 1; id++)
      expect(die(id).big).toBe(false)
    expect(die(10).big).toBe(true)
  })

  it('makes a triple kill or more big', () => {
    expect(reader().read({ EventID: 1, EventName: 'Multikill', KillerName: 'Owner', KillStreak: 2 })[0].big).toBe(false)
    expect(reader().read({ EventID: 1, EventName: 'Multikill', KillerName: 'Owner', KillStreak: 5 })[0]).toMatchObject({ kind: 'gameMultikill', big: true })
    expect(reader().read({ EventID: 1, EventName: 'Multikill', KillerName: 'Enemy', KillStreak: 5 })).toEqual([])
  })

  it('tells whose objective it was, and a steal by her team is big', () => {
    expect(reader().read({ EventID: 1, EventName: 'DragonKill', KillerName: 'Friend', DragonType: 'Fire', Stolen: 'False' })[0]).toEqual({ kind: 'gameObjective', says: 'the owner\'s team took the Fire dragon.', big: false })
    expect(reader().read({ EventID: 1, EventName: 'BaronKill', KillerName: 'Owner', Stolen: 'True' })[0]).toMatchObject({ kind: 'gameObjective', big: true })
    expect(reader().read({ EventID: 1, EventName: 'HeraldKill', KillerName: 'Enemy', Stolen: 'False' })[0].kind).toBe('gameEnemyObjective')
  })

  it('reads aces and the end of the match', () => {
    expect(reader().read({ EventID: 1, EventName: 'Ace', AcingTeam: 'CHAOS' })[0].kind).toBe('gameEnemyAce')
    expect(reader().read({ EventID: 1, EventName: 'GameEnd', Result: 'Win' })[0]).toMatchObject({ kind: 'gameWin', big: true })
    expect(reader().read({ EventID: 1, EventName: 'GameEnd', Result: 'Lose' })[0].kind).toBe('gameLose')
  })
})
