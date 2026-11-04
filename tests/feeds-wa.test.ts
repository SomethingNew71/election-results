import { describe, expect, it } from 'vitest'
import { parseWa, waKind } from '../server/feeds/wa'

const en = (text: string) => [{ languageId: 'en', text }]
const asOf = '2026-10-22T15:55:34.6947355Z'

describe('Washington', () => {
  it('maps House contests and folds write-ins', () => {
    const { version, races } = parseWa({
      ballotItems: [
        { name: en('Initiative Measure No. IL26-001') },
        {
          id: 'x1',
          name: en('Congressional District 1 - U.S. Representative'),
          reportingStatus: { reportingUnits: 0, totalUnits: 2, asOf },
          summaryResults: {
            ballotOptions: [
              { name: en('Suzan DelBene'), voteCount: 0, isWriteIn: false },
              { name: en('Mary Silva'), voteCount: 0, isWriteIn: false },
              { name: en('Write-in'), voteCount: 3, isWriteIn: true },
            ],
          },
        },
        { name: en('Legislative District 1 - State Senator') },
      ],
    })
    expect(races).toHaveLength(1)
    expect(races[0]).toMatchObject({ state: 'WA', kind: 'house', district: 'WA-01', unitsReporting: 0, unitsTotal: 2, unitLabel: 'counties' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Suzan DelBene', votes: 0 },
      { name: 'Mary Silva', votes: 0 },
      { name: 'Write-in', votes: 3 },
    ])
    expect(version).toBe(Date.parse(asOf))
  })

  it('names districts', () => {
    expect(waKind('Congressional District 10 - U.S. Representative')).toEqual({ kind: 'house', district: 'WA-10' })
    expect(waKind('Legislative District 10 - State Senator')).toBeNull()
  })
})
