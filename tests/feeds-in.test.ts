import { describe, expect, it } from 'vitest'
import { indianaDistrict, parseIndiana } from '../server/feeds/in_'

// Trimmed from https://enr.indianavoters.in.gov/site/data/OffCatC_1005_B.json (2026-11-03)
const office = {
  Root: {
    StatewideSummary: {
      Race: [
        {
          OFFICE_TITLE: 'United States Representative, First District',
          Candidates: {
            Candidate: [
              { NAME_ON_BALLOT: 'Frank J. Mrvan', TOTAL: 42476 },
              { NAME_ON_BALLOT: 'Barb Regnitz', TOTAL: 17787 },
              { NAME_ON_BALLOT: 'Alexander R (Alex) Degman (W/I)', TOTAL: 0 },
              { NAME_ON_BALLOT: 'Prescription Dope Deaths Johnson, Jr (W/I)', TOTAL: 0 },
            ],
          },
        },
        {
          OFFICE_TITLE: 'United States Representative, Ninth District',
          Candidates: {
            Candidate: [
              { NAME_ON_BALLOT: 'Erin Houchin', TOTAL: '100' },
              { NAME_ON_BALLOT: 'Write-in', TOTAL: 3 },
              { NAME_ON_BALLOT: 'Write-ins', TOTAL: 2 },
            ],
          },
        },
        { OFFICE_TITLE: 'Something else', Candidates: { Candidate: [] } },
      ],
    },
  },
}

describe('Indiana', () => {
  it('maps ordinal districts', () => {
    expect(indianaDistrict('United States Representative, Fifth District')).toBe('IN-05')
    expect(indianaDistrict('Secretary of State')).toBeNull()
  })

  it('parses US House races and folds write-ins', () => {
    const races = parseIndiana(office, { reporting: 321, total: 5067 })
    expect(races).toHaveLength(2)
    expect(races[0]).toMatchObject({ state: 'IN', kind: 'house', district: 'IN-01', unitsReporting: 321, unitsTotal: 5067 })
    expect(races[0]!.candidates).toEqual([
      { name: 'Frank J. Mrvan', votes: 42476 },
      { name: 'Barb Regnitz', votes: 17787 },
      { name: 'Alexander R (Alex) Degman', votes: 0 },
      { name: 'Prescription Dope Deaths Johnson, Jr', votes: 0 },
    ])
    expect(races[1]!.district).toBe('IN-09')
    expect(races[1]!.candidates).toEqual([
      { name: 'Erin Houchin', votes: 100 },
      { name: 'Write-in', votes: 5 },
    ])
  })
})
