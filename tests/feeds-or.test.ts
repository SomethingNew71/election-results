import { describe, expect, it } from 'vitest'
import { orKind, parseOr } from '../server/feeds/or'

const box = (title: string, precincts: string, rows: [string, string][]) => `
<div class="display-results-box-a">
  <h1>${title}</h1>
</div>
<div class="precinct-fully">
  ${precincts}
</div>
${rows
  .map(
    ([n, v]) => `
<div class="section group">
  <div class="col display-results-box-d">

    <h1>${n}</h1>
    <h2 class="Republican">Republican</h2>
  </div>
  <div class="col display-results-box-e"><div class="bar-graph-wrap"><div id="bar1"></div></div></div>
  <div class="col display-results-box-f">
    <div>${v}</div>
  </div>
</div>
<hr />`,
  )
  .join('')}`

describe('Oregon', () => {
  it('names contests', () => {
    expect(orKind('US Senator')).toEqual({ kind: 'senate', district: null })
    expect(orKind('Governor')).toEqual({ kind: 'governor', district: null })
    expect(orKind('US Representative, 5th District')).toEqual({ kind: 'house', district: 'OR-05' })
    expect(orKind('State Senator, 1st District')).toBeNull()
  })

  it('reads candidates, precincts and write-ins', () => {
    const html =
      box('US Senator', '5 out of 1318 Precincts Reported', [
        ['David Brock Smith', '1,200'],
        ['Jeff Merkley', '2,000'],
        ['Write-in', '7'],
      ]) +
      box('US Representative, 1st District', '0 out of 218 Precincts Reported', [
        ['Barbara J Kahl', '0'],
        ['Suzanne Bonamici', '0'],
      ]) +
      box('State Senator, 1st District', '0 out of 10 Precincts Reported', [['X Y', '0']])
    const races = parseOr(html)
    expect(races).toHaveLength(2)
    expect(races[0]).toMatchObject({ state: 'OR', kind: 'senate', unitsReporting: 5, unitsTotal: 1318, unitLabel: 'precincts' })
    expect(races[0]!.candidates).toEqual([
      { name: 'David Brock Smith', votes: 1200 },
      { name: 'Jeff Merkley', votes: 2000 },
      { name: 'Write-in', votes: 7 },
    ])
    expect(races[1]).toMatchObject({ kind: 'house', district: 'OR-01', unitsTotal: 218 })
  })
})
