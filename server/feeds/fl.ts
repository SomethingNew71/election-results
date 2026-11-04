import type { FeedRace, RaceKind } from '#shared/types'
import { countsFingerprint, type FeedAdapter } from './http'
import { USER_AGENT } from '../utils/civic'

/**
 * Florida Division of Elections "Election Night Reporting" tab-delimited file
 * (linked from floridaelectionwatch.gov/Downloads). One file, ~350 KB, every
 * contest: one row per candidate per county. The Downloads page adds a `?v=`
 * cache token to the link; we read it from that page. The bare file URL is stale. The file has no stamp, so a fingerprint of the counts is the version.
 *
 * Column quirks: a Governor row is a ticket. `CanNameFirst` holds the
 * governor's LAST name and `CanNameLast` the running mate's, so the state's
 * name for a governor is just that surname. Write-ins have PartyCode `WRI`.
 */
const FILE = 'https://flelectionfiles.floridados.gov/enightfilespublic/20261103_ElecResultsFL.txt'
const PAGE = 'https://floridaelectionwatch.gov/Downloads'
const TIMEOUT_MS = 8_000

export function flKind(raceCode: string, raceName: string): { kind: RaceKind; district: string | null } | null {
  if (raceCode === 'USS') return { kind: 'senate', district: null }
  if (raceCode === 'GOV') return { kind: 'governor', district: null }
  if (raceCode === 'USR') {
    const m = raceName.match(/District (\d+)\s*$/i)
    return m ? { kind: 'house', district: `FL-${m[1]!.padStart(2, '0')}` } : null
  }
  return null
}

export function parseFl(text: string): FeedRace[] {
  const lines = text.split(/\r?\n/)
  const head = (lines[0] ?? '').split('\t').map((h) => h.trim())
  const col = (n: string) => head.indexOf(n)
  const ix = {
    party: col('PartyCode'),
    code: col('RaceCode'),
    name: col('RaceName'),
    county: col('CountyCode'),
    precincts: col('Precincts'),
    reporting: col('PrecinctsReporting'),
    last: col('CanNameLast'),
    first: col('CanNameFirst'),
    middle: col('CanNameMiddle'),
    votes: col('CanVotes'),
  }
  if (Object.values(ix).some((i) => i < 0)) throw new Error('Florida Division of Elections: unexpected file columns')

  const races = new Map<string, FeedRace & { counties: Set<string>; byName: Map<string, number> }>()
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const f = line.split('\t')
    const kind = flKind(f[ix.code]!.trim(), f[ix.name]!.trim())
    if (!kind) continue
    const key = `${kind.kind}|${kind.district}`
    let race = races.get(key)
    if (!race) {
      race = {
        state: 'FL',
        ...kind,
        candidates: [],
        unitsReporting: 0,
        unitsTotal: 0,
        unitLabel: 'precincts',
        counties: new Set(),
        byName: new Map(),
      }
      races.set(key, race)
    }
    // Precinct counts repeat on every candidate row of a county: count a county once.
    const county = f[ix.county]!.trim()
    if (!race.counties.has(county)) {
      race.counties.add(county)
      race.unitsTotal += Number(f[ix.precincts]) || 0
      race.unitsReporting += Number(f[ix.reporting]) || 0
    }
    const clean = (s: string | undefined) => (s ?? '').trim()
    const name =
      f[ix.party]!.trim() === 'WRI'
        ? 'Write-in'
        : kind.kind === 'governor'
          ? clean(f[ix.first]) // governor's surname; see the note above
          : [clean(f[ix.first]), clean(f[ix.middle]), clean(f[ix.last])].filter(Boolean).join(' ')
    race.byName.set(name, (race.byName.get(name) ?? 0) + (Number(clean(f[ix.votes]).replace(/,/g, '')) || 0))
  }
  return [...races.values()].map(({ counties: _c, byName, ...race }) => {
    const entries = [...byName.entries()]
    return {
      ...race,
      // Write-ins last, as one row.
      candidates: [...entries.filter(([n]) => n !== 'Write-in'), ...entries.filter(([n]) => n === 'Write-in')].map(([name, votes]) => ({ name, votes })),
    }
  })
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Florida Division of Elections: ${res.status} for ${url}`)
  return res
}

export const fl: FeedAdapter = {
  state: 'FL',
  source: 'Florida Division of Elections',
  sourceUrl: 'https://floridaelectionwatch.gov/',
  async load() {
    // The Downloads link carries the current cache token. The bare file URL is served
    // stale (all zeros at 20:09 ET on election night while the tokened file had votes),
    // so a missing token is an error, not a reason to read the bare file.
    const html = await (await get(PAGE)).text()
    const token = html.match(/20261103_ElecResultsFL\.txt\?v=(\d+)/)?.[1]
    if (!token) throw new Error('Florida Division of Elections: no results file link on the Downloads page')
    const races = parseFl(await (await get(`${FILE}?v=${token}`)).text())
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
