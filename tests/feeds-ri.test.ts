import { describe, expect, it } from 'vitest'
import { parseRhodeIsland, rhodeIslandKind } from '../server/feeds/ri'

// Trimmed from the Board of Elections 2024 general-election file
// (rigov.s3.amazonaws.com/election/results/2024/general_election/statewide.json); the 2026 file has the same layout.
const FILE = {
  election_name: 'General Election',
  last_updated: 'November 22, 2024 05:00 PM',
  contests: [
    {
      name: 'Presidential Electors For:',
      precinct_count: '453',
      precincts_reporting: '453',
      candidates: [{ name: 'Kamala D. Harris', votes: '285156' }],
    },
    {
      name: 'Senator in Congress',
      precinct_count: '414',
      precincts_reporting: '400',
      candidates: [
        { name: 'DEM Sheldon Whitehouse', votes: '294665' },
        { name: 'REP Patricia Morgan', votes: '196039' },
        { name: 'Write-in', votes: '1244' },
      ],
    },
    {
      name: 'Representative in Congress District 1',
      precinct_count: '195',
      precincts_reporting: '195',
      candidates: [
        { name: 'DEM Gabriel Amo', votes: '139352' },
        { name: 'REP Allen R. Waters', votes: '70742' },
        { name: 'Ind C. D. Reynolds', votes: '10463' },
        { name: 'Write-in', votes: '561' },
      ],
    },
    {
      name: 'Governor',
      precinct_count: '414',
      precincts_reporting: '0',
      candidates: [
        { name: 'DEM Daniel J. McKee', votes: '0' },
        { name: 'Ind Zachary Baker Hurwitz', votes: '0' },
        { name: 'WRITE-IN', votes: '0' },
      ],
    },
    { name: '1. CONSTITUTIONAL CONVENTION', candidates: [{ name: 'Reject', votes: '287906' }] },
  ],
}

describe('Rhode Island', () => {
  it('maps contest names', () => {
    expect(rhodeIslandKind('Senator in Congress')).toEqual({ kind: 'senate', district: null })
    expect(rhodeIslandKind('Representative in Congress District 2')).toEqual({ kind: 'house', district: 'RI-02' })
    expect(rhodeIslandKind('Lieutenant Governor')).toBeNull()
  })

  it('reads federal and governor contests, drops party codes and keeps one write-in row', () => {
    const races = parseRhodeIsland(FILE)
    expect(races.map((r) => `${r.kind}:${r.district}`)).toEqual(['senate:null', 'house:RI-01', 'governor:null'])
    expect(races[0]).toMatchObject({ state: 'RI', unitsReporting: 400, unitsTotal: 414, unitLabel: 'precincts' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Sheldon Whitehouse', votes: 294665 },
      { name: 'Patricia Morgan', votes: 196039 },
      { name: 'Write-in', votes: 1244 },
    ])
    expect(races[1]!.candidates.map((c) => c.name)).toEqual(['Gabriel Amo', 'Allen R. Waters', 'C. D. Reynolds', 'Write-in'])
    expect(races[2]!.candidates.at(-1)).toEqual({ name: 'Write-in', votes: 0 })
  })

  it('returns nothing for an empty file', () => {
    expect(parseRhodeIsland({})).toEqual([])
  })
})
