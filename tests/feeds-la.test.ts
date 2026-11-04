import { describe, expect, it } from 'vitest'
import { laKind, laName, parseLa } from '../server/feeds/la'

describe('Louisiana', () => {
  it('maps titles', () => {
    expect(laKind('U. S. Senator')).toEqual({ kind: 'senate', district: null })
    expect(laKind('U. S. Representative -- 3rd Congressional District')).toEqual({ kind: 'house', district: 'LA-03' })
    expect(laKind('PSC -- District 1')).toBeNull()
    expect(laName('"Jamie" Davis (DEM)')).toBe('Jamie Davis')
  })

  it('joins choice ids to names and folds write-ins', () => {
    const races = parseLa(
      {
        Races: {
          Race: [
            {
              ID: '67997',
              SpecificTitle: 'U. S. Senator',
              Choice: [
                { ID: '1', Desc: '"Jamie" Davis (DEM)' },
                { ID: '2', Desc: 'Julia Letlow (REP)' },
              ],
            },
            {
              ID: '70195',
              SpecificTitle: 'U. S. Representative -- 1st Congressional District',
              Choice: [
                { ID: '3', Desc: 'Steve Scalise (REP)' },
                { ID: '4', Desc: 'Write-in' },
                { ID: '5', Desc: 'Other Write-in' },
              ],
            },
            { ID: '1', SpecificTitle: 'Mayor -- Town of Basile', Choice: [{ ID: '9', Desc: 'X (NOP)' }] },
          ],
        },
      },
      {
        Races: {
          VersionDateTime: '2026-11-03T17:50:23.030',
          Race: [
            { ID: '67997', PrecinctsReporting: '10', PrecinctsExpected: '3722', Choice: [{ ID: '1', VoteTotal: '5' }, { ID: '2', VoteTotal: '7' }] },
            {
              ID: '70195',
              PrecinctsReporting: '1',
              PrecinctsExpected: '522',
              Choice: [{ ID: '3', VoteTotal: '9' }, { ID: '4', VoteTotal: '1' }, { ID: '5', VoteTotal: '2' }],
            },
            { ID: '1', PrecinctsReporting: '0', PrecinctsExpected: '1', Choice: [{ ID: '9', VoteTotal: '0' }] },
          ],
        },
      },
    )
    expect(races).toHaveLength(2)
    expect(races[0]).toMatchObject({ state: 'LA', kind: 'senate', unitsReporting: 10, unitsTotal: 3722, unitLabel: 'precincts' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Jamie Davis', votes: 5 },
      { name: 'Julia Letlow', votes: 7 },
    ])
    expect(races[1]).toMatchObject({ kind: 'house', district: 'LA-01' })
    expect(races[1]!.candidates).toEqual([
      { name: 'Steve Scalise', votes: 9 },
      { name: 'Write-in', votes: 3 },
    ])
  })
})
