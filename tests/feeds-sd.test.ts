import { describe, expect, it } from 'vitest'
import { parseSouthDakota, southDakotaKind } from '../server/feeds/sd'

// Trimmed from https://electionresults.sd.gov/resultsSW.aspx?type=SWR&map=CTY
const contest = (title: string, rows: [string, string, string][]) => `
<div class="display-results-box-a"><h1>${title}</h1></div>
<div class="precinct-fully">
    Precincts Fully: 30 / 671
</div>
${rows
  .map(
    ([name, party, votes]) => `
<div class="section group">
  <div class="col display-results-box-d"><h1>${name}</h1><h2 class="${party}">${party}</h2></div>
  <div class="col display-results-box-e"><div id="bar1"></div></div>
  <div class="col display-results-box-f"><h1>${votes}</h1></div>
</div><hr />`,
  )
  .join('')}`

const PAGE = `
${contest('United States Senator', [
  ['Mike  Rounds ', 'Republican', '2,000'],
  ['Brian L Bengs ', 'Independent', '900'],
])}
${contest('United States Representative', [
  ['Marty  Jackley ', 'Republican', '2,100'],
  ['Nicole &quot;Nikki&quot;  Gronli ', 'Democratic', '800'],
])}
${contest('Governor and Lieutenant Governor', [
  ['Larry Rhoden and Tony Venhuizen ', 'Republican', '1,900'],
  ['Dan Ahlers and Steven  McCleerey ', 'Democratic', '1,000'],
])}
${contest('Secretary of State', [['Heather  Baxter ', 'Republican', '5']])}`

describe('South Dakota', () => {
  it('parses Senate, House and governor from the HTML page', () => {
    const races = parseSouthDakota(PAGE)
    expect(races.map((r) => [r.kind, r.district])).toEqual([
      ['senate', null],
      ['house', 'SD-AL'],
      ['governor', null],
    ])
    expect(races[0]).toMatchObject({ state: 'SD', unitsReporting: 30, unitsTotal: 671, unitLabel: 'precincts' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Mike Rounds', votes: 2000 },
      { name: 'Brian L Bengs', votes: 900 },
    ])
    expect(races[1]!.candidates[1]).toEqual({ name: 'Nicole "Nikki" Gronli', votes: 800 })
    expect(races[2]!.candidates[1]).toEqual({ name: 'Dan Ahlers and Steven McCleerey', votes: 1000 })
  })

  it('maps titles', () => {
    expect(southDakotaKind('United States Representative')).toEqual({ kind: 'house', district: 'SD-AL' })
    expect(southDakotaKind('State Treasurer')).toBeNull()
  })
})
