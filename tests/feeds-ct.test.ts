import { describe, expect, it } from 'vitest'
import { connecticutKind, parseConnecticut, parsePrecincts } from '../server/feeds/ct'

// Trimmed from ctemspublic.tgstg.net/ng-app/data/election/108/52106/{Lookupdata,stateVotes_Electiondata}.json.
// Vote counts were 0 when sampled; the counts here are filled in by hand to test the sums.
const LOOKUP = {
  officeList: [
    { '19663': { ID: '19663', NM: 'Governor and Lieutenant Governor' } },
    { '19667': { ID: '19667', NM: 'Representative in Congress 2' } },
    { '19700': { ID: '19700', NM: 'State Senator 5' } },
  ],
  candidateIds: {
    '44186': { NM: 'Ned Lamont and Susan Bysiewicz', P: '1' },
    '43810': { NM: 'Ryan Fazio and Matt Corey', P: '6' },
    '44299': { NM: 'Ned Lamont and Susan Bysiewicz', P: '12' },
    '44396': { NM: 'Ryan Fazio and Matt Corey', P: '3' },
    '44485': { NM: 'Zenobia Adgers and Rick Adgers', P: '1026' },
    '44487': { NM: 'Christian Noe and Michael S. Grant', P: '1026' },
    '43495': { NM: 'Joe Courtney', P: '1' },
    '43574': { NM: 'George Patrick Austin', P: '6' },
    '44397': { NM: 'George Patrick Austin', P: '3' },
    '99999': { NM: 'Someone Else', P: '1' },
  },
  partyIds: {
    '1': { NM: 'Democratic Party' },
    '3': { NM: 'Independent Party' },
    '6': { NM: 'Republican Party' },
    '12': { NM: 'Working Families Party' },
    '1026': { NM: 'Write In' },
  },
}

const VOTES = {
  '19663': [
    { '44186': { V: '1,000', TO: '10.00%' } },
    { '43810': { V: '800', TO: '8.00%' } },
    { '44299': { V: '200', TO: '2.00%' } },
    { '44396': { V: '50', TO: '0.50%' } },
    { '44485': { V: '3', TO: '0.03%' } },
    { '44487': { V: '4', TO: '0.04%' } },
  ],
  '19667': [{ '43495': { V: '0', TO: '0.00%' } }, { '43574': { V: '0' } }, { '44397': { V: '0' } }],
  '19700': [{ '99999': { V: '5' } }],
}

describe('Connecticut', () => {
  it('maps office names', () => {
    expect(connecticutKind('Governor and Lieutenant Governor')).toEqual({ kind: 'governor', district: null })
    expect(connecticutKind('Representative in Congress 5')).toEqual({ kind: 'house', district: 'CT-05' })
    expect(connecticutKind('State Senator 5')).toBeNull()
  })

  it('sums party lines by person and folds named write-ins into one row', () => {
    const races = parseConnecticut(LOOKUP, VOTES, { reporting: 12, total: 776 })
    expect(races.map((r) => `${r.kind}:${r.district}`)).toEqual(['governor:null', 'house:CT-02'])
    expect(races[0]).toMatchObject({ state: 'CT', unitsReporting: 12, unitsTotal: 776, unitLabel: 'precincts' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Ned Lamont', votes: 1200 },
      { name: 'Ryan Fazio', votes: 850 },
      { name: 'Write-in', votes: 7 },
    ])
    // Austin runs on the Republican and Independent lines: one row.
    expect(races[1]!.candidates).toEqual([
      { name: 'Joe Courtney', votes: 0 },
      { name: 'George Patrick Austin', votes: 0 },
    ])
  })

  it('reads the precinct counter', () => {
    expect(parsePrecincts('0 of 776 (0%)')).toEqual({ reporting: 0, total: 776 })
    expect(parsePrecincts('1,200 of 1,500 (80%)')).toEqual({ reporting: 1200, total: 1500 })
    expect(parsePrecincts(undefined)).toEqual({ reporting: 0, total: 0 })
  })
})
