/**
 * Writes public/data/county-2024.json: 2024 presidential results per county,
 * keyed by 5-digit FIPS, as [total votes, Democratic votes, Republican votes].
 * Source: tonmcg/US_County_Level_Election_Results_08-24 (MIT licence).
 * Alaska rows are house districts with no county FIPS and are left out.
 *
 *   bun scripts/build-county-2024.ts
 */
const SOURCE =
  'https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2024_US_County_Level_Presidential_Results.csv'

const csv = await (await fetch(SOURCE)).text()
const [header, ...lines] = csv.trim().split('\n')
const cols = header!.split(',')
const at = (name: string) => cols.indexOf(name)
const [fipsCol, gopCol, demCol, totalCol, stateCol] = ['county_fips', 'votes_gop', 'votes_dem', 'total_votes', 'state_name'].map(at)

const out: Record<string, [number, number, number]> = {}
for (const line of lines) {
  const f = line.split(',')
  if (f[stateCol!] === 'Alaska') continue
  const fips = f[fipsCol!]!.padStart(5, '0')
  out[fips] = [Number(f[totalCol!]), Number(f[demCol!]), Number(f[gopCol!])]
}
await Bun.write(new URL('../public/data/county-2024.json', import.meta.url), JSON.stringify(out))
console.log(`${Object.keys(out).length} counties`)
