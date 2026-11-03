import type { FeedRace, FeedRegion, RaceKind, VoteTypeCounts } from '#shared/types'
import { alignByName, getJson, type FeedAdapter } from './http'

/**
 * Tally ENR (TotalResults) API, used by Arkansas and Missouri. Results carry
 * only choice ids; names come from the contest list, which is large (about
 * 1 MB) and fetched once per object lifetime. County results are inline,
 * keyed by 5-digit FIPS. `versionID` ("v97") is the version.
 * `GetSingleContestResults` (about 30 KB) splits one contest by vote type,
 * where the state publishes the split (Arkansas does; Missouri does not).
 */
const API = 'https://enr-results-api.totalresults.com'

export function tallyKind(state: string, name: string): { kind: RaceKind; district: string | null } | null {
  if (/^U\.S\. Senat(e|or)$/i.test(name)) return { kind: 'senate', district: null }
  if (/^Governor$/i.test(name)) return { kind: 'governor', district: null }
  const m = name.match(/^U\.S\. (?:Congress|Representative) District (\d+)$/i)
  return m ? { kind: 'house', district: `${state}-${m[1]!.padStart(2, '0')}` } : null
}

/** "REP Tom Cotton" → "Tom Cotton". */
export function stripPartyPrefix(name: string): string {
  return name.replace(/^(DEM|REP|LIB|GRN|GRE|CON|IND|NON|NP|NPA)\s+/, '')
}

interface TallyChoice {
  choiceID: string
  totalVotes: number
}
interface TallyLocation {
  precinctsReporting: number
  totalPrecincts: number
  choices: TallyChoice[]
  /** The feed spells this `writeInChoices` on contests and `writeinChoices` on locations. */
  writeInChoices?: TallyChoice[]
  writeinChoices?: TallyChoice[]
}
export interface TallyResults {
  versionID: string
  response: {
    contests: Record<
      string,
      TallyLocation & { contestID: string; locations?: Record<string, TallyLocation> }
    >
  }
}
export type TallyNames = Record<string, { contestName: string; choices: { id: string; name: string; isWriteIn: boolean }[] }>

/** `contestTypes[i]` is the contest type `results[i]` was requested with; it goes into each race's `ref`. */
export function parseTally(state: string, results: TallyResults[], names: TallyNames, contestTypes: string[] = []): FeedRace[] {
  const out: FeedRace[] = []
  for (const [ri, r] of results.entries()) {
    for (const contest of Object.values(r.response?.contests ?? {})) {
      const meta = names[contest.contestID]
      if (!meta) continue
      const kind = tallyKind(state, meta.contestName)
      if (!kind) continue
      const nameOf = new Map(meta.choices.map((c) => [c.id, c]))
      const listed = contest.choices.filter((c) => nameOf.has(c.choiceID) && !nameOf.get(c.choiceID)!.isWriteIn)
      const writeInsOf = (loc: TallyLocation) => [
        ...(loc.writeInChoices ?? loc.writeinChoices ?? []),
        ...loc.choices.filter((c) => nameOf.get(c.choiceID)?.isWriteIn),
      ]
      const writeIns = writeInsOf(contest)
      const order = listed.map((c) => c.choiceID)
      const votesFor = (loc: TallyLocation) => {
        const by = new Map(loc.choices.map((c) => [c.choiceID, c.totalVotes]))
        const wi = writeInsOf(loc)
        const votes = order.map((id) => Number(by.get(id)) || 0)
        return writeIns.length ? [...votes, wi.reduce((n, c) => n + (Number(c.totalVotes) || 0), 0)] : votes
      }
      const regions: FeedRegion[] = Object.entries(contest.locations ?? {}).map(([fips, loc]) => ({
        name: fips,
        fips,
        precinctsReporting: Number(loc.precinctsReporting) || 0,
        precinctsTotal: Number(loc.totalPrecincts) || 0,
        votes: votesFor(loc),
      }))
      const totals = votesFor(contest)
      out.push({
        state,
        ...kind,
        candidates: [
          ...listed.map((c, i) => ({ name: stripPartyPrefix(nameOf.get(c.choiceID)!.name), votes: totals[i]! })),
          ...(writeIns.length ? [{ name: 'Write-in', votes: totals.at(-1)! }] : []),
        ],
        unitsReporting: Number(contest.precinctsReporting) || 0,
        unitsTotal: Number(contest.totalPrecincts) || 0,
        unitLabel: 'precincts',
        regions: regions.length ? regions : undefined,
        ref: contestTypes[ri] ? `${contestTypes[ri]}|${contest.contestID}` : undefined,
      })
    }
  }
  return out
}

type BucketChoice = { choiceID: string; votes?: { voteTypeID: string; votes: number }[] }
export interface TallySingleContest {
  response: { choices: BucketChoice[]; writeinChoices?: BucketChoice[]; writeInChoices?: BucketChoice[] }
}

export function parseTallyBreakdown(
  race: FeedRace,
  data: TallySingleContest,
  meta: TallyNames[string],
  typeNames: Map<string, string>,
): VoteTypeCounts | null {
  const c = data.response
  const choices = [...(c?.choices ?? []), ...(c?.writeinChoices ?? c?.writeInChoices ?? [])]
  const ids: string[] = []
  for (const ch of choices) for (const v of ch.votes ?? []) if (!ids.includes(v.voteTypeID)) ids.push(v.voteTypeID)
  if (ids.length < 2) return null
  // Contests list their buckets in different orders; use the election's order so every race reads the same.
  const order = [...typeNames.keys()]
  ids.sort((a, b) => (order.indexOf(a) >>> 0) - (order.indexOf(b) >>> 0))
  const nameOf = new Map(meta.choices.map((x) => [x.id, x]))
  const writeIns = new Set((c?.writeinChoices ?? c?.writeInChoices ?? []).map((x) => x.choiceID))
  const rows = choices.map((ch) => {
    const by = new Map((ch.votes ?? []).map((v) => [v.voteTypeID, Number(v.votes) || 0]))
    const known = nameOf.get(ch.choiceID)
    return {
      name: known ? stripPartyPrefix(known.name) : ch.choiceID,
      writeIn: writeIns.has(ch.choiceID) || Boolean(known?.isWriteIn),
      votes: ids.map((id) => by.get(id) ?? 0),
    }
  })
  const votes = alignByName(race.candidates, rows, ids.length)
  return votes && { types: ids.map((id) => typeNames.get(id) ?? 'Other'), votes }
}

export function tallyAdapter(opts: {
  state: string
  cid: string
  source: string
  sourceUrl: string
  /** Picks the 2026 general from the election list. */
  election: (e: { electionName: string; electionDate: string }) => boolean
  contestTypes: string[]
  /** The state publishes a vote-type split. */
  voteTypes?: boolean
}): FeedAdapter {
  let electionID: string | null = null
  let names: TallyNames | null = null
  let typeNames: Map<string, string> | null = null
  return {
    state: opts.state,
    source: opts.source,
    sourceUrl: opts.sourceUrl,
    async load(prev) {
      if (!electionID) {
        const list = await getJson<{ electionID: string; electionName: string; electionDate: string }[]>(
          `${API}/Election/GetElectionList?cid=${opts.cid}`,
          opts.source,
        )
        electionID = list.find(opts.election)?.electionID ?? null
        if (!electionID) throw new Error(`${opts.source}: no 2026 general election listed`)
      }
      const results = await Promise.all(
        opts.contestTypes.map((t) =>
          getJson<TallyResults>(`${API}/Contest/GetContestResults?cId=${opts.cid}&electionID=${electionID}&contestType=${encodeURIComponent(t)}`, opts.source),
        ),
      )
      // Each contest type has its own version; the sum rises when any one does.
      const version = results.reduce((n, r) => n + (Number(String(r.versionID).replace(/\D/g, '')) || 0), 0)
      if (prev !== null && version <= prev) return { version }
      if (!names) {
        const list = await getJson<{ response: { contests: Record<string, { contestId: string; contestName: string; choices: Record<string, { name: string; isWriteIn: boolean }> | { id: string; name: string; isWriteIn: boolean }[] }> } }>(
          `${API}/Contest/GetContestSearchList?cid=${opts.cid}&electionID=${electionID}`,
          opts.source,
        )
        names = {}
        for (const c of Object.values(list.response.contests)) {
          if (!tallyKind(opts.state, c.contestName)) continue
          const choices = Array.isArray(c.choices)
            ? c.choices.map((x) => ({ id: x.id, name: x.name, isWriteIn: Boolean(x.isWriteIn) }))
            : Object.entries(c.choices).map(([id, x]) => ({ id, name: x.name, isWriteIn: Boolean(x.isWriteIn) }))
          names[c.contestId] = { contestName: c.contestName, choices }
        }
      }
      return { version, races: parseTally(opts.state, results, names, opts.contestTypes) }
    },
    async voteTypes(race) {
      if (!opts.voteTypes || !race.ref || !electionID || !names) return null
      const [type, contestID] = race.ref.split('|') as [string, string]
      const meta = names[contestID]
      if (!meta) return null
      if (!typeNames) {
        // About 600 KB (it lists every location); fetched once per object lifetime.
        const info = await getJson<{ response?: { voteTypes?: Record<string, { description: string }> } }>(
          `${API}/Election/GetElectionInfo?cId=${opts.cid}&electionID=${electionID}`,
          opts.source,
        )
        typeNames = new Map(Object.entries(info.response?.voteTypes ?? {}).map(([id, v]) => [id, v.description]))
      }
      const data = await getJson<TallySingleContest>(
        `${API}/Contest/GetSingleContestResults?cId=${opts.cid}&electionID=${electionID}&contestType=${encodeURIComponent(type)}&contestID=${encodeURIComponent(contestID)}`,
        opts.source,
      )
      return parseTallyBreakdown(race, data, meta, typeNames)
    },
  }
}

const is2026General = (e: { electionName: string; electionDate: string }) =>
  e.electionDate.startsWith('2026-11-03') && /general/i.test(e.electionName)

export const arkansas = tallyAdapter({
  state: 'AR',
  cid: 'arkansas',
  source: 'Arkansas Secretary of State',
  sourceUrl: 'https://arkansas.tally-enr.com/',
  election: is2026General,
  contestTypes: ['Federal', 'Statewide'],
  voteTypes: true,
})

export const missouri = tallyAdapter({
  state: 'MO',
  cid: 'mo',
  source: 'Missouri Secretary of State',
  sourceUrl: 'https://mo.tally-enr.com/',
  election: is2026General,
  contestTypes: ['Federal'],
})
