import { describe, expect, it } from 'vitest'
import { georgiaKind, georgiaName, parseGeorgia } from '../server/feeds/ga'

const en = (text: string) => [{ languageId: 'en', text }]
const status = { reportingUnits: 107, totalUnits: 159, asOf: '2026-11-04T01:10:39.4207285Z' }
const opt = (name: string, voteCount: number, isWriteIn = false) => ({ name: en(name), voteCount, isWriteIn })

// Trimmed from the live /data response of 2026-11-03.
const data = {
  ballotItems: [
    { name: en('US Senate'), reportingStatus: status, summaryResults: { ballotOptions: [opt('Mike Collins (Rep)', 831312), opt('Jon Ossoff (I) (Dem)', 1328794)] } },
    { name: en('Governor'), reportingStatus: status, summaryResults: { ballotOptions: [opt('Rick Jackson (Rep)', 923705), opt('Keisha Lance Bottoms (Dem)', 1237173)] } },
    { name: en('Lieutenant Governor'), reportingStatus: status, summaryResults: { ballotOptions: [opt('Greg Dolezal (Rep)', 1)] } },
    {
      name: en('US House of Representatives - District 1'),
      reportingStatus: { ...status, reportingUnits: 3, totalUnits: 20, asOf: '2026-11-04T01:15:00Z' },
      summaryResults: { ballotOptions: [opt('Jim Kingston (Rep)', 50), opt('Amanda Hollowell (Dem)', 40), opt('A Writer', 1, true), opt('B Writer', 2, true)] },
    },
    { name: en('State Senate - District 1'), reportingStatus: status, summaryResults: { ballotOptions: [opt('Ben Watson (I) (Rep)', 5)] } },
  ],
}

describe('Georgia', () => {
  it('keeps Senate, governor and House only, with the newest asOf as the version', () => {
    const { version, races } = parseGeorgia(data)
    expect(races.map((r) => `${r.kind}:${r.district}`)).toEqual(['senate:null', 'governor:null', 'house:GA-01'])
    expect(version).toBe(Date.parse('2026-11-04T01:15:00Z'))
    expect(races[0]).toMatchObject({ state: 'GA', unitsReporting: 107, unitsTotal: 159, unitLabel: 'counties' })
  })
  it('strips party tags and folds write-ins', () => {
    const { races } = parseGeorgia(data)
    expect(races[0]!.candidates).toEqual([
      { name: 'Mike Collins', votes: 831312 },
      { name: 'Jon Ossoff', votes: 1328794 },
    ])
    expect(races[2]!.candidates.at(-1)).toEqual({ name: 'Write-in', votes: 3 })
  })
  it('maps names and districts', () => {
    expect(georgiaName('Tremaine "Teddy" Reese (Dem)')).toBe('Tremaine "Teddy" Reese')
    expect(georgiaKind('US House of Representatives - District 14')).toEqual({ kind: 'house', district: 'GA-14' })
    expect(georgiaKind('PSC - District 3')).toBeNull()
  })
})
