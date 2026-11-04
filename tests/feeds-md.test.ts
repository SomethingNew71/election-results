import { describe, expect, it } from 'vitest'
import { parseMarylandGovernor, parseMarylandHouse } from '../server/feeds/md'

const row = (name: string, party: string, cells: string[]) =>
  `<tr>\n\t<td><div>${name}</div></td>\n\t<td>${party}</td>\n\t${cells.slice(0, 4).map((c) => `<td class="alignRight"> ${c}</td>`).join('')}\n\t<td class="alignRight">${cells[4]}</td>\n\t<td class="alignRight">${cells[5]}</td>\n</tr>`

const table = (rows: string) => `<div class="tableWrapper">
	<table class="table-banded">
		<thead>
			<tr>
				<th scope="col">Name</th>
				<th scope="col">Party</th>
				<th class="alignRight" scope="col">Early Voting</th><th class="alignRight" scope="col">Election Day</th><th class="alignRight" scope="col">Mail-In Ballot</th><th class="alignRight" scope="col">Provisional</th>
				<th class="alignRight" scope="col">Total</th>
				<th class="alignRight" scope="col">Percentage</th>
			</tr>
		</thead>
		<tbody>${rows}</tbody><tr>
	<td><div><b>Totals</b></div></td>
	<td></td>
	<td class="alignRight"> <b>NR</b></td><td class="alignRight"> <b>NR</b></td><td class="alignRight"> <b>NR</b></td><td class="alignRight"> <b>NR</b></td>
	<td class="alignRight"><b>NR</b></td>
	<td class="alignRight"><b>NR</b></td>
</tr></table></div>`

// Markup from gen_results_2026_1.html (governor, before any precinct reported, "NR" cells).
const NR = ['NR', 'NR', 'NR', 'NR', 'NR', 'NR']
const GOVERNOR_NR = `<h2>Governor / Lt. Governor</h2>
<h3>Vote for 1</h3>
<a href="gen_detail_results_2026_1_1.html">County Break Down</a>(0 of 1979 election day precincts reported)
${table(
  row('Wes Moore and Aruna Miller', 'Democratic', NR) +
    row('Dan Cox and Rob Krop', 'Republican', NR) +
    row('Andy Ellis and Owen Silverman Andrews', 'Green', NR) +
    row('Cathy White and Cathy Permut', 'Working Class Party', NR) +
    row('Other Write-Ins', '', NR),
)}`

// Markup from gen_results_2026_4.html (all districts on one page); counts filled in by hand.
const HOUSE = `<h2>Representative in Congress</h2>
<h3>District 1</h3>
<h4>Vote for 1</h4>
<a href="gen_detail_results_2026_4_1_District 1.html">County Break Down</a>(12 of 309 election day precincts reported)
${table(
  row('Dan Schwartz', 'Democratic', ['100', '50', '20', '1', '171', '30%']) +
    row('Andy Harris', 'Republican', ['200', '90', '30', '2', '322', '60%']) +
    row('Edward Shlikas (Write-In)', 'Unaffiliated', ['1', '0', '0', '0', '1', '0%']) +
    row('Other Write-Ins', '', ['2', '1', '0', '0', '3', '0%']),
)}
<h3>District 7</h3>
<h4>Vote for 1</h4>
<a href="x.html">County Break Down</a>(0 of 338 election day precincts reported)
${table(row('Kweisi Mfume', 'Democratic', NR) + row('Scott M. Collier', 'Republican', NR))}`

describe('Maryland', () => {
  it('reads the governor page and treats NR as 0', () => {
    const [gov, ...rest] = parseMarylandGovernor(GOVERNOR_NR)
    expect(rest).toHaveLength(0)
    expect(gov).toMatchObject({ state: 'MD', kind: 'governor', district: null, unitsReporting: 0, unitsTotal: 1979, unitLabel: 'election day precincts' })
    expect(gov!.candidates).toEqual([
      { name: 'Wes Moore', votes: 0 },
      { name: 'Dan Cox', votes: 0 },
      { name: 'Andy Ellis', votes: 0 },
      { name: 'Cathy White', votes: 0 },
      { name: 'Write-in', votes: 0 },
    ])
  })

  it('reads one House race per district and folds write-ins', () => {
    const races = parseMarylandHouse(HOUSE)
    expect(races.map((r) => r.district)).toEqual(['MD-01', 'MD-07'])
    expect(races[0]).toMatchObject({ kind: 'house', unitsReporting: 12, unitsTotal: 309 })
    expect(races[0]!.candidates).toEqual([
      { name: 'Dan Schwartz', votes: 171 },
      { name: 'Andy Harris', votes: 322 },
      { name: 'Write-in', votes: 4 },
    ])
    expect(races[0]!.byType).toEqual({
      types: ['Early Voting', 'Election Day', 'Mail-In Ballot', 'Provisional'],
      votes: [
        [100, 50, 20, 1],
        [200, 90, 30, 2],
        [3, 1, 0, 0],
      ],
    })
  })

  it('returns nothing for a page without tables', () => {
    expect(parseMarylandHouse('<html></html>')).toEqual([])
    expect(parseMarylandGovernor('<html></html>')).toEqual([])
  })
})
