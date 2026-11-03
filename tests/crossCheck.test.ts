import { describe, expect, it } from 'vitest'
import { mergeFeed, personKey } from '../shared/utils/crossCheck'
import { contestKind, parseClarity } from '../server/utils/stateFeeds'
import type { Candidate, FeedRace, RaceSummary } from '../shared/types'

const meta = { source: 'Iowa Secretary of State', sourceUrl: 'https://x/', fetchedAt: '2026-11-03T00:00:00Z', checkedAt: '2026-11-03T00:00:00Z', version: '1' }

const cand = (name: string, votes: number): Candidate => ({ name, party: 'P', color: '#888', votes, winner: false })

const race = (pct: number, candidates: Candidate[]): RaceSummary => ({
  id: 1,
  kind: 'governor',
  name: 'Iowa Governor',
  state: 'IA',
  district: null,
  pct,
  candidates,
})

const feed = (candidates: { name: string; votes: number }[], unitsReporting = 50): FeedRace => ({
  state: 'IA',
  kind: 'governor',
  district: null,
  candidates,
  unitsReporting,
  unitsTotal: 99,
})

describe('personKey', () => {
  it('keys tickets on the first person', () => {
    expect(personKey('Zach Lahn and Derek Wulf')).toBe('lahn')
    expect(personKey('Victor Marx / George Washington Markert')).toBe('marx')
  })
  it('drops suffixes and nicknames', () => {
    expect(personKey('Daniel J. Jr. Sullivan')).toBe('sullivan')
    expect(personKey("Mark 'Marky Jr' Elworth")).toBe('elworth')
    expect(personKey('Mariannette Miller-Meeks')).toBe('miller-meeks')
  })
})

describe('mergeFeed', () => {
  it('uses the feed when it has counted more votes', () => {
    const merged = mergeFeed(
      race(40, [cand('Zach Lahn', 400), cand('Rob Sand', 600)]),
      feed([
        { name: 'Zach Lahn and Derek Wulf', votes: 500 },
        { name: 'Rob Sand and Dave Muhlbauer', votes: 700 },
        { name: 'Write-in', votes: 3 },
      ]),
      meta,
    )
    expect(merged.crossCheck?.used).toBe(true)
    expect(merged.candidates.map((c) => c.votes)).toEqual([500, 700])
    expect(merged.pct).toBe(40)
  })

  it('refuses to match when two candidates share a surname', () => {
    const merged = mergeFeed(
      race(40, [cand('Jason Crow', 400), cand('Ann Crow', 600)]),
      feed([
        { name: 'Jason Crow', votes: 500 },
        { name: 'Ann Crow', votes: 700 },
      ]),
      meta,
    )
    expect(merged.crossCheck?.matched).toBe(false)
    expect(merged.candidates.map((c) => c.votes)).toEqual([400, 600])
  })

  it('takes every shown count from the state when it uses the feed', () => {
    const merged = mergeFeed(
      race(40, [cand('Zach Lahn', 400), cand('Rob Sand', 600), cand('Write-in', 5), cand('Minor Person', 2)]),
      feed([
        { name: 'Zach Lahn and Derek Wulf', votes: 500 },
        { name: 'Rob Sand and Dave Muhlbauer', votes: 700 },
        { name: 'Write-in', votes: 9 },
      ]),
      meta,
    )
    expect(merged.candidates.map((c) => c.votes)).toEqual([500, 700, 9, 0])
  })

  it('keeps civicAPI when it is ahead', () => {
    const merged = mergeFeed(
      race(60, [cand('Zach Lahn', 600), cand('Rob Sand', 900)]),
      feed([
        { name: 'Zach Lahn and Derek Wulf', votes: 500 },
        { name: 'Rob Sand and Dave Muhlbauer', votes: 700 },
      ]),
      meta,
    )
    expect(merged.crossCheck?.used).toBe(false)
    expect(merged.crossCheck?.matched).toBe(true)
    expect(merged.candidates.map((c) => c.votes)).toEqual([600, 900])
  })

  it('does not use the feed when a candidate is missing', () => {
    const merged = mergeFeed(
      race(10, [cand('Zach Lahn', 10), cand('Rob Sand', 10)]),
      feed([
        { name: 'Zach Lahn and Derek Wulf', votes: 500 },
        { name: 'Someone Else', votes: 700 },
      ]),
      meta,
    )
    expect(merged.crossCheck?.matched).toBe(false)
    expect(merged.crossCheck?.used).toBe(false)
    expect(merged.candidates.map((c) => c.votes)).toEqual([10, 10])
  })

  it('allows minor civicAPI-only candidates such as registered write-ins', () => {
    const merged = mergeFeed(
      race(40, [cand('Zach Lahn', 400), cand('Rob Sand', 600), cand('Minor Person', 2)]),
      feed([
        { name: 'Zach Lahn and Derek Wulf', votes: 500 },
        { name: 'Rob Sand and Dave Muhlbauer', votes: 700 },
      ]),
      meta,
    )
    expect(merged.crossCheck?.used).toBe(true)
    expect(merged.candidates.map((c) => c.votes)).toEqual([500, 700, 0])
  })

  it('rejects a civicAPI-only candidate with real support', () => {
    const merged = mergeFeed(
      race(40, [cand('Zach Lahn', 400), cand('Rob Sand', 600), cand('Big Third', 200)]),
      feed([
        { name: 'Zach Lahn and Derek Wulf', votes: 500 },
        { name: 'Rob Sand and Dave Muhlbauer', votes: 700 },
      ]),
      meta,
    )
    expect(merged.crossCheck?.matched).toBe(false)
  })

  it('never derives reporting % from counties reporting', () => {
    const merged = mergeFeed(
      race(0, [cand('Zach Lahn', 0), cand('Rob Sand', 0)]),
      feed([
        { name: 'Zach Lahn and Derek Wulf', votes: 50 },
        { name: 'Rob Sand and Dave Muhlbauer', votes: 70 },
      ], 98),
      meta,
    )
    expect(merged.crossCheck?.used).toBe(true)
    expect(merged.pct).toBe(0)
  })
})

describe('Clarity contests', () => {
  it('maps contest names to races', () => {
    expect(contestKind('IA', 'United States Senator')).toEqual({ kind: 'senate', district: null })
    expect(contestKind('IA', 'Governor and Lt. Governor')).toEqual({ kind: 'governor', district: null })
    expect(contestKind('CO', 'Governor / Lieutenant Governor')).toEqual({ kind: 'governor', district: null })
    expect(contestKind('IA', 'United States Representative District 3')).toEqual({ kind: 'house', district: 'IA-03' })
    expect(contestKind('CO', 'Representative to the 120th United States Congress - District 8')).toEqual({
      kind: 'house',
      district: 'CO-08',
    })
    expect(contestKind('CO', 'State Board of Education Member - Congressional District 1')).toBeNull()
    expect(contestKind('IA', 'State Senator District 2')).toBeNull()
  })

  it('parses a summary', () => {
    const parsed = parseClarity('IA', [
      { K: '1000', C: 'United States Senator', CH: ['Ashley Hinson', 'Josh Turek'], V: [10, 20], PR: 2, TP: 99 },
      { K: '9', C: 'County Supervisor', CH: ['X'], V: [1], PR: 0, TP: 1 },
    ])
    expect(parsed).toEqual([
      {
        state: 'IA',
        kind: 'senate',
        district: null,
        candidates: [
          { name: 'Ashley Hinson', votes: 10 },
          { name: 'Josh Turek', votes: 20 },
        ],
        unitsReporting: 2,
        unitsTotal: 99,
      },
    ])
  })
})
