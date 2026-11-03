import type { FeedRace, RaceKind } from '#shared/types'
import { getJson, leadingInt, countsFingerprint, type FeedAdapter } from './http'

/**
 * Ohio Secretary of State live results (liveresults.ohiosos.gov). Statewide
 * totals only; the county breakdown is a 300 KB call per contest. The feed
 * has no version stamp, so a fingerprint of the counts stands in for one.
 */
const BASE = 'https://liveresults.ohiosos.gov/Api/v1/Contest'
const CONTESTS: { query: string; match: (name: string) => { kind: RaceKind; district: string | null } | null }[] = [
  { query: 'U.S. Senator', match: (n) => (/^U\.S\. Senator/i.test(n) ? { kind: 'senate', district: null } : null) },
  { query: 'Governor and Lieutenant Governor', match: (n) => (/^Governor\b/i.test(n) ? { kind: 'governor', district: null } : null) },
  {
    query: 'Representative to Congress',
    match: (n) => {
      const m = n.match(/^Representative to Congress - District (\d+)$/i)
      return m ? { kind: 'house', district: `OH-${m[1]!.padStart(2, '0')}` } : null
    },
  },
]

export interface OhioContest {
  contestList: {
    name: string
    candidatesRunning: { primaryCandidate: string; vCount: number; isWriteIn: boolean }[]
  }[]
}

export function parseOhio(contests: { query: string; data: OhioContest }[], precincts: { reporting: number; total: number }): FeedRace[] {
  const out: FeedRace[] = []
  for (const { query, data } of contests) {
    const spec = CONTESTS.find((c) => c.query === query)!
    for (const contest of data.contestList ?? []) {
      const kind = spec.match(contest.name)
      if (!kind) continue
      const writeIns = contest.candidatesRunning.filter((c) => c.isWriteIn).reduce((n, c) => n + (Number(c.vCount) || 0), 0)
      out.push({
        state: 'OH',
        ...kind,
        candidates: [
          ...contest.candidatesRunning.filter((c) => !c.isWriteIn).map((c) => ({ name: c.primaryCandidate, votes: Number(c.vCount) || 0 })),
          ...(contest.candidatesRunning.some((c) => c.isWriteIn) ? [{ name: 'Write-in', votes: writeIns }] : []),
        ],
        // Statewide Election Day precincts; House districts get the same figure.
        unitsReporting: precincts.reporting,
        unitsTotal: precincts.total,
        unitLabel: 'Election Day precincts statewide',
      })
    }
  }
  return out
}

export const ohio: FeedAdapter = {
  state: 'OH',
  source: 'Ohio Secretary of State',
  sourceUrl: 'https://liveresults.ohiosos.gov/',
  async load() {
    const [stats, ...contests] = await Promise.all([
      getJson<{ allStatistics?: { name: string; value: string }[] }>(`${BASE}/getStatistics`, this.source),
      ...CONTESTS.map((c) =>
        getJson<OhioContest>(`${BASE}/GetContestDetailsObject?contestName=${encodeURIComponent(c.query)}`, this.source).then((data) => ({
          query: c.query,
          data,
        })),
      ),
    ])
    const rows = stats.allStatistics ?? []
    const find = (re: RegExp) => leadingInt(rows.find((r) => re.test(r.name ?? ''))?.value)
    const races = parseOhio(contests, { reporting: find(/Precincts Reporting/i), total: find(/Total Number of Election Day Precincts/i) })
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
