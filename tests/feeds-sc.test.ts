import { describe, expect, it } from 'vitest'
import { parseSc, scKind, scName } from '../server/feeds/sc'

describe('South Carolina', () => {
  it('maps contests and names', () => {
    expect(scKind('U.S.  Senate')).toEqual({ kind: 'senate', district: null })
    expect(scKind('Governor and Lieutenant Governor')).toEqual({ kind: 'governor', district: null })
    expect(scKind('U.S.  House of Representatives, District  1')).toEqual({ kind: 'house', district: 'SC-01' })
    expect(scKind('State Treasurer')).toBeNull()
    expect(scName('REP Alan Wilson / Mike Reichenbach')).toBe('Alan Wilson')
    expect(scName('DEM Annie Andrews')).toBe('Annie Andrews')
  })

  it('parses contests and folds write-ins', () => {
    const races = parseSc([
      { C: 'Governor and Lieutenant Governor', CH: ['REP Alan Wilson / Mike Reichenbach', 'DEM Jermaine Johnson / Sam Skardon', 'Write-In'], V: [166458, 157680, 146], PR: 0, TP: 46 },
      { C: 'U.S.  House of Representatives, District  1', CH: ['REP Jenny Costa Honeycutt', 'DEM Nancy Lacore', 'Write-In'], V: [210, 335, 0], PR: 1, TP: 6 },
      { C: 'State Treasurer', CH: ['REP X'], V: [1], PR: 0, TP: 46 },
    ])
    expect(races).toHaveLength(2)
    expect(races[0]).toMatchObject({ state: 'SC', kind: 'governor', unitsReporting: 0, unitsTotal: 46, unitLabel: 'counties' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Alan Wilson', votes: 166458 },
      { name: 'Jermaine Johnson', votes: 157680 },
      { name: 'Write-in', votes: 146 },
    ])
    expect(races[1]).toMatchObject({ kind: 'house', district: 'SC-01', unitsReporting: 1, unitsTotal: 6 })
  })
})
