import { describe, expect, it } from 'vitest'
import { northDakotaKind, parseNorthDakota } from '../server/feeds/nd'

// Trimmed from https://results.sos.nd.gov/ResultsSW.aspx?text=All&type=SW&map=CTY (the 2024 election, the only one the site held on 2026-11-03)
const row = (name: string, votes: string, extra = '') => `
<div class="section group">
  <div class="col display-results-box-d" ${extra}>
    <h2>${name}</h2>
  </div>
  <div class="display-results-row">
    <div class="display-results-box-e"><div class="Republican">Republican</div></div>
    <h2 class="display-results-box-g" >${votes}</h2>
    <h2 class="display-results-box-f">66.31%</h2>
  </div>
</div><hr />`

const WRITE_IN = `<div class='show-writein' id='Plus_1'>write-in </div><div style='display:none' id='Minus_1'>write-in </div>`

const contest = (title: string, rows: string) => `
<div class="display-results-box-a">
  <h1>${title} </h1>
  <h2>Vote For 1</h2>
</div>
<div class="display-results-box-b"><div class="precinct-fully">Precincts Fully: 385 / 385</div></div>
<div class="candidate-rows">${rows}
  <div class="totals-row"><h2 class="display-results-box-total">359,787</h2></div>
</div>`

const PAGE = `${contest('President & Vice-President of the United States', row('Someone', '1'))}
${contest('Representative in Congress', row('Julie  Fedorchak ', '249,101') + row('Trygve  Hammer ', '109,231') + row(WRITE_IN, '1,455'))}
${contest('Governor and Lt. Governor', row('Kelly Armstrong and Michelle Strinden ', '247,056'))}`

describe('North Dakota', () => {
  it('parses House and governor and folds the write-in row', () => {
    const races = parseNorthDakota(PAGE)
    expect(races.map((r) => [r.kind, r.district])).toEqual([
      ['house', 'ND-AL'],
      ['governor', null],
    ])
    expect(races[0]).toMatchObject({ state: 'ND', unitsReporting: 385, unitsTotal: 385, unitLabel: 'precincts' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Julie Fedorchak', votes: 249101 },
      { name: 'Trygve Hammer', votes: 109231 },
      { name: 'Write-in', votes: 1455 },
    ])
  })

  it('maps titles', () => {
    expect(northDakotaKind('United States Senator ')).toEqual({ kind: 'senate', district: null })
    expect(northDakotaKind('Insurance Commissioner')).toBeNull()
  })
})
