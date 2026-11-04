import { describe, expect, it } from 'vitest'
import { parseUtah, utahKind, utahName } from '../server/feeds/ut'

const en = (text: string) => [{ languageId: 'en', text }]

// Trimmed from https://electionresults.utah.gov/results/public/api/elections/Utah/General11032026/data
const SAMPLE = {
  election: { asOf: '2026-11-03T22:02:22.9124264Z' },
  ballotItems: [
    {
      name: en('U.S. House District 1'),
      reportingStatus: { reportingUnits: 1, totalUnits: 1, asOf: '2026-11-04T04:10:00.0000000Z' },
      summaryResults: {
        ballotOptions: [
          { name: en('RILEY OWEN'), voteCount: 1200, isWriteIn: false },
          { name: en('BEN MCADAMS'), voteCount: 3400, isWriteIn: false },
          { name: en('BABAK "BOBBY" DARVISH '), voteCount: 7, isWriteIn: true },
          { name: en('WRITE-IN'), voteCount: 3, isWriteIn: true },
        ],
      },
    },
    {
      name: en('State Senate District 6'),
      reportingStatus: { reportingUnits: 0, totalUnits: 0, asOf: '2026-11-03T22:02:22.9124264Z' },
      summaryResults: { ballotOptions: [{ name: en('JARED NEAL'), voteCount: 0, isWriteIn: false }] },
    },
    { name: en('U.S. House District 3'), summaryResults: { ballotOptions: [] } },
  ],
}

describe('Utah', () => {
  it('maps contests, title-cases names, folds write-ins and uses asOf as the version', () => {
    const { version, races } = parseUtah(SAMPLE)
    expect(version).toBe(Date.parse('2026-11-04T04:10:00.0000000Z'))
    expect(races).toHaveLength(2)
    expect(races[0]).toMatchObject({ state: 'UT', kind: 'house', district: 'UT-01', unitsReporting: 1, unitsTotal: 1, unitLabel: 'counties' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Riley Owen', votes: 1200 },
      { name: 'Ben McAdams', votes: 3400 },
      { name: 'Write-in', votes: 10 },
    ])
    expect(races[1]).toMatchObject({ district: 'UT-03', unitsReporting: 0, unitsTotal: 0, candidates: [] })
  })

  it('keeps only federal contests', () => {
    expect(utahKind('U.S. House District 4')).toEqual({ kind: 'house', district: 'UT-04' })
    expect(utahKind('State Senate District 1 (Multi-County)')).toBeNull()
    expect(utahName('Kent S. Udell')).toBe('Kent S. Udell')
    expect(utahName('MICHAEL R. STODDARD')).toBe('Michael R. Stoddard')
  })
})
