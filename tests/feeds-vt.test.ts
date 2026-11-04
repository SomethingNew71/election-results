import { describe, expect, it } from 'vitest'
import { parseTownsReporting, parseVermont, vermontFile } from '../server/feeds/vt'

// Trimmed from static.electionresults.vermont.gov/elections/<2026 general guid>-s-20261103201109.json
// (two of the reporting towns; the real file has about 66 town rows per office).
const STATEWIDE = {
  d: [
    {
      o: [
        {
          on: 'GOVERNOR',
          cs: [
            {
              tn: 'BARTON',
              rc: [
                { cid: 210405, cn: 'JUNE GOODBAND', vc: 5, isWriteIn: false },
                { cid: 225760, cn: 'AMANDA JANOO', vc: 357, isWriteIn: false },
                { cid: 225759, cn: 'PHIL SCOTT', vc: 643, isWriteIn: false },
                { cid: 777, cn: 'RYAN ROY', vc: 2, isWriteIn: true },
              ],
              wc: [{ cid: 0, cn: 'OTHER WRITE-IN', vc: 5, isWriteIn: false }],
            },
            {
              tn: 'BERKSHIRE',
              rc: [
                { cid: 210405, cn: 'JUNE GOODBAND', vc: 1, isWriteIn: false },
                { cid: 225760, cn: 'AMANDA JANOO', vc: 109, isWriteIn: false },
                { cid: 225759, cn: 'PHIL SCOTT', vc: 435, isWriteIn: false },
              ],
              wc: [{ cid: 0, cn: 'OTHER WRITE-IN', vc: 3, isWriteIn: false }],
            },
          ],
        },
        { on: 'LIEUTENANT GOVERNOR', cs: [{ rc: [{ cn: 'MOLLY GRAY', vc: 9 }] }] },
      ],
    },
  ],
}

const HOUSE = {
  d: [
    {
      o: [
        {
          on: 'REPRESENTATIVE TO CONGRESS',
          cs: [{ tn: 'BARTON', rc: [{ cn: 'BECCA BALINT', vc: 543 }, { cn: 'GERALD MALLOY', vc: 392 }], wc: [{ cn: 'OTHER WRITE-IN', vc: 2 }] }],
        },
      ],
    },
  ],
}

describe('Vermont', () => {
  it('sums town rows and folds named and other write-ins into one row', () => {
    const [gov, ...rest] = parseVermont(STATEWIDE, { reporting: 63, total: 247 })
    expect(rest).toHaveLength(0)
    expect(gov).toMatchObject({ state: 'VT', kind: 'governor', district: null, unitsReporting: 63, unitsTotal: 247, unitLabel: 'towns' })
    expect(gov!.candidates).toEqual([
      { name: 'JUNE GOODBAND', votes: 6 },
      { name: 'AMANDA JANOO', votes: 466 },
      { name: 'PHIL SCOTT', votes: 1078 },
      { name: 'Write-in', votes: 10 },
    ])
  })

  it('maps the at-large House race', () => {
    const [house] = parseVermont(HOUSE, { reporting: 0, total: 0 })
    expect(house).toMatchObject({ kind: 'house', district: 'VT-AL', unitsReporting: 0, unitsTotal: 0 })
    expect(house!.candidates).toEqual([
      { name: 'BECCA BALINT', votes: 543 },
      { name: 'GERALD MALLOY', votes: 392 },
      { name: 'Write-in', votes: 2 },
    ])
  })

  it('reads the index: file URLs, stamp and town count', () => {
    expect(vermontFile({ isEnable: true, path: 'elections\\68d61e96-1d28-4210-8c1d-8e90512ae105-f-20261103201109.json' })).toEqual({
      url: 'https://static.electionresults.vermont.gov/elections/68d61e96-1d28-4210-8c1d-8e90512ae105-f-20261103201109.json',
      stamp: 20261103201109,
    })
    expect(vermontFile({ isEnable: false, path: 'x' })).toBeNull()
    expect(parseTownsReporting('63/247')).toEqual({ reporting: 63, total: 247 })
    expect(parseTownsReporting('63 OF 247')).toEqual({ reporting: 63, total: 247 })
    expect(parseTownsReporting(undefined)).toEqual({ reporting: 0, total: 0 })
  })
})
