import { describe, expect, it } from 'vitest'
import { nebraskaKind, parseNebraska } from '../server/feeds/ne'

const cand = (name: string, party: string, votes: string) => `
  <div class="section group">
    <div class="col display-results-box-d">
      <h1>${name} </h1>
      <h2 class="${party}">${party}</h2>
    </div>
    <div class="col display-results-box-e"><div class="bar-graph-wrap"><div id="bar1"></div></div></div>
    <div class="col display-results-box-f">
      <h1>${votes}</h1>
    </div>
  </div>
  <hr />`

const contest = (title: string, total: number, rows: string) => `
  <div class="display-results-box-a"><h1>${title}</h1></div>
  <div class="precinct-fully">
    Precincts Fully: 12 / ${total}
  </div>
  ${rows}`

// Shape trimmed from https://electionresults.nebraska.gov/resultsSW.aspx (2026-11-03 general election)
const html =
  contest(
    'For United States Senator - 6  Year Term',
    1322,
    cand('Pete  Ricketts', 'Republican', '1,200') + cand('Dan  Osborn', 'By Petition', '900') + cand('Write-In', 'Write-In', '3') + cand('Write-In 2', 'x', '4'),
  ) +
  contest('For Governor and Lt. Governor', 1322, cand('Jim  Pillen and Joe  Kelly', 'Republican', '10') + cand('Lynne  Walz and Ben  Steffen', 'Democratic', '8')) +
  contest('For Secretary of State', 1322, cand('Scott  Petersen', 'Republican', '5')) +
  contest('For Representative in Congress - 2  Year Term - District 02', 438, cand('Brinker  Harding', 'Republican', '7') + cand('Denise  Powell', 'Democratic', '6'))

describe('Nebraska', () => {
  it('maps headings', () => {
    expect(nebraskaKind('For Representative in Congress - 2 Year Term - District 03')).toEqual({ kind: 'house', district: 'NE-03' })
    expect(nebraskaKind('For State Treasurer')).toBeNull()
  })

  it('parses Senate, Governor and House, skipping other offices', () => {
    const races = parseNebraska(html)
    expect(races.map((r) => `${r.kind}:${r.district}`)).toEqual(['senate:null', 'governor:null', 'house:NE-02'])
    expect(races[0]!.candidates).toEqual([
      { name: 'Pete Ricketts', votes: 1200 },
      { name: 'Dan Osborn', votes: 900 },
      { name: 'Write-in', votes: 7 },
    ])
    expect(races[1]!.candidates.map((c) => c.name)).toEqual(['Jim Pillen', 'Lynne Walz'])
    expect(races[2]).toMatchObject({ state: 'NE', unitsReporting: 12, unitsTotal: 438, unitLabel: 'precincts' })
  })
})
