import { describe, expect, it } from 'vitest'
import { ncKind, parseNc } from '../server/feeds/nc'

const row = (cnm: string, bnm: string, vct: string, prt = '12', ptl = '156') => ({ cnm, bnm, vct, prt, ptl })

// Trimmed from the live results_0.txt of 2026-11-03 (counts invented, structure real).
const rows = [
  row('US SENATE (VOTE FOR 1)', 'Michael Dublin', '10', '5', '2626'),
  row('US SENATE (VOTE FOR 1)', 'Roy Cooper', '300', '5', '2626'),
  row('US SENATE (VOTE FOR 1)', 'Michael Whatley', '280', '5', '2626'),
  row('US HOUSE OF REPRESENTATIVES DISTRICT 02 (VOTE FOR 1)', 'Eugene F. Douglass', '40'),
  row('US HOUSE OF REPRESENTATIVES DISTRICT 02 (VOTE FOR 1)', 'Deborah K. Ross', '60'),
  row('US HOUSE OF REPRESENTATIVES DISTRICT 02 (VOTE FOR 1)', 'Write-In (Miscellaneous)', '3'),
  row('US HOUSE OF REPRESENTATIVES DISTRICT 02 (VOTE FOR 1)', 'Write-In (Other)', '2'),
  row('NC STATE SENATE DISTRICT 01 (VOTE FOR 1)', 'Someone', '9'),
]

describe('North Carolina', () => {
  it('maps Senate and House contests and ignores the rest', () => {
    const races = parseNc(rows)
    expect(races.map((r) => `${r.kind}:${r.district}`)).toEqual(['senate:null', 'house:NC-02'])
    expect(races[0]).toMatchObject({ state: 'NC', unitsReporting: 5, unitsTotal: 2626, unitLabel: 'precincts' })
    expect(races[0]!.candidates[1]).toEqual({ name: 'Roy Cooper', votes: 300 })
  })
  it('folds write-ins into one row', () => {
    const house = parseNc(rows)[1]!
    expect(house.candidates).toEqual([
      { name: 'Eugene F. Douglass', votes: 40 },
      { name: 'Deborah K. Ross', votes: 60 },
      { name: 'Write-in', votes: 5 },
    ])
    expect(house).toMatchObject({ unitsReporting: 12, unitsTotal: 156 })
  })
  it('keys contests', () => {
    expect(ncKind('US HOUSE OF REPRESENTATIVES DISTRICT 14 (VOTE FOR 1)')).toEqual({ kind: 'house', district: 'NC-14' })
    expect(ncKind('NC GOVERNOR')).toBeNull()
  })
})
