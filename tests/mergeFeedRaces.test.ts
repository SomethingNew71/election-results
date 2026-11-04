import { describe, expect, it } from 'vitest'
import { mergeFeedRaces, withoutFrozenPct } from '../server/utils/stateFeeds'
import { parseRaceList } from '../server/utils/civic'
import type { FeedRace, RaceSummary } from '../shared/types'

const race = (district: string, a: number, b = 0): FeedRace => ({
  state: 'PA',
  kind: 'house',
  district,
  candidates: [{ name: 'A', votes: a }, { name: 'B', votes: b }],
  unitsReporting: 0,
  unitsTotal: 0,
  unitLabel: 'precincts',
})
const votes = (r: { races: FeedRace[] }, d: string) => r.races.find((x) => x.district === d)!.candidates[0]!.votes

describe('mergeFeedRaces', () => {
  it('keeps races a partial load omits', () => {
    const out = mergeFeedRaces([race('PA-01', 100), race('PA-02', 50)], [race('PA-01', 120)], new Map(), true)
    expect(votes(out, 'PA-01')).toBe(120)
    expect(votes(out, 'PA-02')).toBe(50)
    expect(out.held).toBe(false)
  })

  it('never drops a race to 0, stamped or not', () => {
    for (const unordered of [true, false]) {
      const seen = new Map<string, number>()
      const prev = [race('PA-01', 100)]
      expect(votes(mergeFeedRaces(prev, [race('PA-01', 0)], seen, unordered), 'PA-01')).toBe(100)
      expect(votes(mergeFeedRaces(prev, [race('PA-01', 0)], seen, unordered), 'PA-01')).toBe(100)
    }
  })

  it('holds an unstamped lower count until two polls agree', () => {
    const seen = new Map<string, number>()
    const prev = [race('PA-01', 100)]
    const first = mergeFeedRaces(prev, [race('PA-01', 90)], seen, true)
    expect(votes(first, 'PA-01')).toBe(100)
    expect(first.held).toBe(true)
    const second = mergeFeedRaces(first.races, [race('PA-01', 90)], seen, true)
    expect(votes(second, 'PA-01')).toBe(90)
    expect(second.held).toBe(false)
  })

  it('does not apply an older copy that alternates with newer counts', () => {
    const seen = new Map<string, number>()
    let races = [race('PA-01', 100)]
    races = mergeFeedRaces(races, [race('PA-01', 90)], seen, true).races
    races = mergeFeedRaces(races, [race('PA-01', 110)], seen, true).races
    races = mergeFeedRaces(races, [race('PA-01', 90)], seen, true).races
    expect(races[0]!.candidates[0]!.votes).toBe(110)
  })

  it('applies a stamped lower count at once, and adds new races', () => {
    const out = mergeFeedRaces([race('PA-01', 100)], [race('PA-01', 90), race('PA-02', 5)], new Map(), false)
    expect(votes(out, 'PA-01')).toBe(90)
    expect(votes(out, 'PA-02')).toBe(5)
  })
})

describe('withoutFrozenPct', () => {
  const summary = (used: boolean) => ({ pct: 53, crossCheck: { used } }) as unknown as RaceSummary

  it('hides the % only when stale and showing a state count', () => {
    expect(withoutFrozenPct(summary(true), true)).toMatchObject({ pct: 0, pctFrozen: true })
    expect(withoutFrozenPct(summary(false), true).pct).toBe(53)
    expect(withoutFrozenPct(summary(true), false).pct).toBe(53)
  })
})

describe('parseRaceList', () => {
  const body = (x: unknown) => new Response(JSON.stringify(x))

  it('refuses an error body or a short list', async () => {
    await expect(parseRaceList(body({ error: 'x' }), 500)).rejects.toThrow()
    await expect(parseRaceList(body({ races: [] }), 500)).rejects.toThrow()
    await expect(parseRaceList(body({ races: new Array(300).fill({}) }), 500)).resolves.toHaveProperty('races')
  })
})
