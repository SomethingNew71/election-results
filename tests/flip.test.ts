import { describe, expect, it } from 'vitest'
import { flipOf, type FlipRace } from '../shared/utils/flip'
import { GOVERNOR_HOLDERS, HOUSE_HOLDERS, NEW_HOUSE_MAP, SENATE_HOLDERS } from '../shared/utils/seatHolders'
import { GOVERNOR_NOT_UP, SENATE_NOT_UP, countParties } from '../shared/utils/officeholders'
import raceSeed from '../server/data/race-seed.json'

const race = (over: Partial<FlipRace>, party: string, winner = true): FlipRace => ({
  kind: 'senate',
  state: 'NC',
  district: null,
  candidates: [
    { party, votes: 60, winner },
    { party: 'Other', votes: 40, winner: false },
  ],
  ...over,
})

describe('flipOf', () => {
  it('reports a called winner from another party', () => {
    expect(flipOf(race({}, 'Democratic'))).toEqual({ from: 'Republican', to: 'Democratic' })
    expect(flipOf(race({ kind: 'governor', state: 'GA' }, 'Democratic'))).toEqual({ from: 'Republican', to: 'Democratic' })
    expect(flipOf(race({ kind: 'house', state: 'VA', district: 'VA-02' }, 'Democratic'))).toEqual({ from: 'Republican', to: 'Democratic' })
  })

  it('treats an independent winner as a change, whatever civicAPI calls it', () => {
    expect(flipOf(race({ state: 'NE' }, 'Independent'))).toEqual({ from: 'Republican', to: 'Independent' })
    expect(flipOf(race({ state: 'NE' }, 'No Party Affiliation'))?.to).toBe('Independent')
  })

  it('is silent with no called winner, whoever leads', () => {
    expect(flipOf(race({}, 'Democratic', false))).toBeNull()
  })

  it('is silent when the holder keeps the seat', () => {
    expect(flipOf(race({}, 'Republican'))).toBeNull()
  })

  it('is silent for a nonpartisan winner, a territory, and a new House map', () => {
    expect(flipOf(race({}, 'Nonpartisan'))).toBeNull()
    expect(flipOf(race({ kind: 'governor', state: 'GU' }, 'Republican'))).toBeNull()
    expect(flipOf(race({ kind: 'house', state: 'VA', district: 'VA-02', delegate: true }, 'Democratic'))).toBeNull()
    expect(flipOf(race({ kind: 'house', state: 'TX', district: 'TX-09' }, 'Democratic'))).toBeNull()
  })

  it('is silent for any party label it does not know', () => {
    for (const label of ['Write-In', 'DEM/NON', 'Democrat', 'Libertarian', 'Independent Party of Florida', 'Other Party', 'Unaffiliated']) {
      expect(flipOf(race({}, label)), label).toBeNull()
    }
  })

  it('is silent for a flag under 50% where a runoff or RCV can follow', () => {
    const under = (over: Partial<FlipRace>) => ({
      ...race(over, 'Democratic'),
      candidates: [
        { party: 'Democratic', votes: 49, winner: true },
        { party: 'Republican', votes: 51, winner: false },
      ],
    })
    expect(flipOf(under({ kind: 'governor', state: 'GA' }))).toBeNull()
    expect(flipOf(under({ kind: 'senate', state: 'AK' }))).toBeNull()
    expect(flipOf(under({}))?.to).toBe('Democratic')
  })

  it('reads at-large seats and the last district', () => {
    expect(flipOf(race({ kind: 'house', state: 'WY', district: 'WY-AL' }, 'Democratic'))?.from).toBe('Republican')
    expect(flipOf(race({ kind: 'house', state: 'PA', district: 'PA-17' }, 'Republican'))?.from).toBe('Democratic')
  })
})

describe('seat holder tables', () => {
  const count = (t: Record<string, string>) => Object.values(t).reduce<Record<string, number>>((n, p) => ({ ...n, [p]: (n[p] ?? 0) + 1 }), {})

  it('add up with the seats not on the ballot', () => {
    const notUp = countParties(SENATE_NOT_UP)
    // Sanders and King caucus with the Democrats; 47 D+I and 53 R.
    expect(count(SENATE_HOLDERS).D! + notUp.Democratic! + notUp.Independent!).toBe(47)
    expect(count(SENATE_HOLDERS).R! + notUp.Republican!).toBe(53)
    const govNotUp = countParties(GOVERNOR_NOT_UP)
    expect(count(GOVERNOR_HOLDERS).D! + govNotUp.Democratic!).toBe(24)
    expect(count(GOVERNOR_HOLDERS).R! + govNotUp.Republican!).toBe(26)
  })

  it('cover every race on the ballot once, except new maps', () => {
    const races = [...raceSeed.General, ...raceSeed.Statewide]
    const house = races.filter((r) => r.type === 'House of Representatives' && r.province !== 'US').map((r) => r.district!)
    const expected = house.filter((d) => !NEW_HOUSE_MAP.includes(d.slice(0, 2)))
    const listed = Object.entries(HOUSE_HOLDERS).flatMap(([st, letters]) =>
      [...letters].map((_, i) => (letters.length === 1 ? `${st}-AL` : `${st}-${String(i + 1).padStart(2, '0')}`)),
    )
    expect(listed.sort()).toEqual(expected.sort())
    const state = (type: string) => races.filter((r) => r.type === type && /^[A-Z]{2}$/.test(r.province ?? '') && !['US', 'GU', 'MP', 'VI'].includes(r.province!)).map((r) => r.province)
    expect(state('US Senate').sort()).toEqual(Object.keys(SENATE_HOLDERS).sort())
    expect(state('Governor').sort()).toEqual(Object.keys(GOVERNOR_HOLDERS).sort())
  })
})
