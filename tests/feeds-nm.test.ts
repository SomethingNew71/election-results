import { describe, expect, it } from 'vitest'
import { newMexicoKind, newMexicoName, parseNewMexico } from '../server/feeds/nm'

// Trimmed from https://electionresults.sos.nm.gov/resultsSW.aspx?type=FED&map=CTY (and type=SW for the governor)
const contest = (title: string, rows: [string, string, string][], fully = '12 / 2204') => `
<div class="display-results-box-a"><h1>${title} </h1></div>
<div class="precinct-fully">
    Precincts Fully: ${fully}
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
  .join('')}
<div class="display-results-box-total"><h2>0</h2></div>`

const FED = `<input id="hidElectionDate" value="11/3/2026" />
${contest('United States Senator', [
  ['BEN R LUJAN', 'Democrat', '1,200'],
  ['LARRY E MARKER', 'Republican', '800'],
])}
${contest('United States Representative DISTRICT 2', [
  ['GREGORY G CUNNINGHAM', 'Republican', '10'],
  ['GABRIEL VASQUEZ', 'Democrat', '20'],
])}`

const SW = `${contest('Governor and Lieutenant Governor', [
  ['GREGGORY D HULL AND DAVID M GALLEGOS', 'Republican', '5'],
  ['DEB HAALAND AND STEPHANIE GARCIA RICHARD', 'Democrat', '7'],
  ['Write-in', 'Nonpartisan', '2'],
])}
${contest('Secretary of State', [['AMANDA LÓPEZ ASKIN', 'Democrat', '1']])}
${contest('JUDICIAL RETENTION: Shall DAVID K THOMSON be retained?', [['Yes', '', '3']])}`

describe('New Mexico', () => {
  it('parses federal and governor contests from the HTML pages', () => {
    const races = parseNewMexico([FED, SW])
    expect(races.map((r) => [r.kind, r.district])).toEqual([
      ['senate', null],
      ['house', 'NM-02'],
      ['governor', null],
    ])
    expect(races[0]).toMatchObject({ state: 'NM', unitsReporting: 12, unitsTotal: 2204, unitLabel: 'precincts' })
    expect(races[0]!.candidates).toEqual([
      { name: 'Ben R Luján', votes: 1200 },
      { name: 'Larry E Marker', votes: 800 },
    ])
    expect(races[2]!.candidates).toEqual([
      { name: 'Greggory D Hull and David M Gallegos', votes: 5 },
      { name: 'Deb Haaland and Stephanie Garcia Richard', votes: 7 },
      { name: 'Write-in', votes: 2 },
    ])
  })

  it('maps titles and names', () => {
    expect(newMexicoKind('United States Representative DISTRICT 3')).toEqual({ kind: 'house', district: 'NM-03' })
    expect(newMexicoKind('Secretary of State ')).toBeNull()
    expect(newMexicoName('NDIDIAMAKA EKWUA CHARLENE OKPAREKE')).toBe('Ndidiamaka Ekwua Charlene Okpareke')
    expect(newMexicoName('Teresa Leger Fernandez')).toBe('Teresa Leger Fernandez')
  })
})
