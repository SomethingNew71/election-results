import { describe, expect, it } from 'vitest'
import { caKind, parseCa } from '../server/feeds/ca'

describe('California', () => {
  it('maps governor and House titles', () => {
    expect(caKind('Governor - Statewide Results')).toEqual({ kind: 'governor', district: null })
    expect(caKind('U.S. House of Representatives District 1 - Districtwide Results')).toEqual({ kind: 'house', district: 'CA-01' })
    expect(caKind('Lieutenant Governor - Statewide Results')).toBeNull()
  })

  it('parses counts, precinct totals and write-ins', () => {
    const races = parseCa([
      {
        raceTitle: 'Governor - Statewide Results',
        Reporting: '0% (0 of 23,860) precincts reporting',
        candidates: [
          { Name: 'Xavier Becerra', Party: 'Dem', Votes: '1,200' },
          { Name: 'Steve Hilton', Party: 'Rep', Votes: '900' },
          { Name: 'Write-in', Votes: '3' },
        ],
      },
      {
        raceTitle: 'U.S. House of Representatives District 1 - Districtwide Results',
        Reporting: '12% (95 of 788) precincts reporting',
        candidates: [
          { Name: 'Mike McGuire', Party: 'Dem', Votes: '0' },
          { Name: 'James Gallagher', Party: 'Rep', Votes: '0' },
        ],
      },
    ])
    expect(races[0]).toMatchObject({ state: 'CA', kind: 'governor', district: null, unitsReporting: 0, unitsTotal: 23860 })
    expect(races[0]!.candidates).toEqual([
      { name: 'Xavier Becerra', votes: 1200 },
      { name: 'Steve Hilton', votes: 900 },
      { name: 'Write-in', votes: 3 },
    ])
    expect(races[1]).toMatchObject({ kind: 'house', district: 'CA-01', unitsReporting: 95, unitsTotal: 788 })
  })
})
