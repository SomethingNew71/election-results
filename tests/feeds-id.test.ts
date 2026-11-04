import { describe, expect, it } from 'vitest'
import { idahoKind, parseIdaho } from '../server/feeds/id'

const en = (text: string) => [{ languageId: 'en', text }]
const asOf = '2026-11-04T00:05:31.7955583Z'

// Trimmed from https://results.voteidaho.gov/results/public/api/elections/id/nov2026/data
const SAMPLE = {
  election: { asOf },
  ballotItems: [
    {
      name: en('United States Senator'),
      reportingStatus: { reportingUnits: 12, totalUnits: 44, asOf },
      summaryResults: {
        ballotOptions: [
          { name: en('Jim Risch'), voteCount: 500, isWriteIn: false },
          { name: en('Todd Achilles'), voteCount: 300, isWriteIn: false },
        ],
      },
    },
    {
      name: en('United States Representative District 2'),
      reportingStatus: { reportingUnits: 3, totalUnits: 26, asOf },
      summaryResults: { ballotOptions: [{ name: en('Mike Simpson'), voteCount: 40, isWriteIn: false }] },
    },
    {
      name: en('Governor'),
      reportingStatus: { reportingUnits: 12, totalUnits: 44, asOf },
      summaryResults: {
        ballotOptions: [
          { name: en('Brad Little'), voteCount: 600, isWriteIn: false },
          { name: en('Jacob Burnett'), voteCount: 4, isWriteIn: true },
          { name: en('Write-in'), voteCount: 1, isWriteIn: true },
        ],
      },
    },
    { name: en('Lieutenant Governor'), summaryResults: { ballotOptions: [{ name: en('Scott Bedke'), voteCount: 1, isWriteIn: false }] } },
  ],
}

describe('Idaho', () => {
  it('maps federal and governor contests', () => {
    const { version, races } = parseIdaho(SAMPLE)
    expect(version).toBe(Date.parse(asOf))
    expect(races.map((r) => [r.kind, r.district])).toEqual([
      ['senate', null],
      ['house', 'ID-02'],
      ['governor', null],
    ])
    expect(races[0]).toMatchObject({ state: 'ID', unitsReporting: 12, unitsTotal: 44, unitLabel: 'counties' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Jim Risch', votes: 500 },
      { name: 'Todd Achilles', votes: 300 },
    ])
  })

  it('folds write-ins into one row', () => {
    const gov = parseIdaho(SAMPLE).races[2]!
    expect(gov.candidates).toEqual([
      { name: 'Brad Little', votes: 600 },
      { name: 'Write-in', votes: 5 },
    ])
  })

  it('ignores other offices', () => {
    expect(idahoKind('United States Representative District 1')).toEqual({ kind: 'house', district: 'ID-01' })
    expect(idahoKind('State Senator District 1')).toBeNull()
  })
})
