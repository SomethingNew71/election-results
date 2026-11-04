import { describe, expect, it } from 'vitest'
import { paDistrict, paName, parsePa } from '../server/feeds/pa'

const cand = (CandidateName: string, Votes: string) => ({ CandidateName, Votes, PartyName: 'X', RankOrder: '1' })

// Trimmed from the live responses of 2026-11-03.
const summary = {
  Election: {
    Governor: [{ OfficeId: '3', DistrictId: '1', Statewide: [cand('JOSH SHAPIRO', '267554'), cand('STACY GARRITY', '58101'), cand('KEN KRAWCHUK', '2526')] }],
  },
}
const house = {
  Election: {
    'Representative in Congress': [
      {
        '1st Congressional District$$2$$': [{ DistrictId: '2', District: '1st Congressional District', Candidates: [cand('BOB HARVIE', '49963'), cand('BRIAN FITZPATRICK', '24419')] }],
        '10th Congressional District$$11$$': [{ DistrictId: '11', District: '10th Congressional District', Candidates: [cand('JANELLE STELSON', '14060'), cand('SCOTT PERRY', '5577')] }],
        '11th Congressional District$$12$$': [{ DistrictId: '12', District: '11th Congressional District', Candidates: [cand('NANCY MANNION', '9585'), cand('LLOYD K SMUCKER', '4912')] }],
      },
    ],
  },
}
const offices = {
  Table1: [{ DashboardMessage: '\r\n\t\t{\r\n\t\t"DistrictMessage": " 33 Out of 9,066 Districts (0.36%)","ReportingDistrict":"33","VotingDistrict":"9066","Percentage":"0.36"}' }],
}

describe('Pennsylvania', () => {
  it('maps governor and House races', () => {
    const races = parsePa(summary, house, offices)
    expect(races.map((r) => `${r.kind}:${r.district}`)).toEqual(['governor:null', 'house:PA-01', 'house:PA-10', 'house:PA-11'])
    expect(races[0]!.candidates[0]).toEqual({ name: 'Josh Shapiro', votes: 267554 })
    expect(races[1]).toMatchObject({ state: 'PA', unitsReporting: 33, unitsTotal: 9066 })
  })
  it('gives 0 of 0 when the reporting message is missing or broken', () => {
    expect(parsePa(summary, {}, {})[0]).toMatchObject({ unitsReporting: 0, unitsTotal: 0 })
    expect(parsePa(summary, {}, { Table1: [{ DashboardMessage: 'not json' }] })[0]).toMatchObject({ unitsTotal: 0 })
  })
  it('formats names and districts', () => {
    expect(paName('LLOYD K SMUCKER')).toBe('Lloyd K Smucker')
    expect(paName("DAN MEUSER ")).toBe('Dan Meuser')
    expect(paDistrict('2nd Congressional District')).toBe('PA-02')
    expect(paDistrict('Statewide')).toBeNull()
  })
})
