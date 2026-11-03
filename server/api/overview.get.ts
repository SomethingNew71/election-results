import type { ChamberTotals, Overview, RaceKind, RaceSummary } from '#shared/types'
import type { CivicRace, CivicRaceDetail } from '../utils/civic'

const ELECTION_DATE = '2026-11-03'
const CHAMBER_SIZE: Record<RaceKind, number> = { senate: 100, house: 435, governor: 50 }

function search(scope: 'General' | 'Statewide') {
  return civicGet<{ races: CivicRace[] }>(
    `/race/search?country=US&startDate=${ELECTION_DATE}&endDate=${ELECTION_DATE}&election_type=${scope}&limit=5000`,
  )
}

export default defineEventHandler(async (event): Promise<Overview> => {
  const [general, statewide] = await Promise.all([search('General'), search('Statewide')])

  const races: RaceSummary[] = []
  const national = new Map<RaceKind, number>()
  const seen = new Set<number>()

  for (const r of [...general.races, ...statewide.races]) {
    const kind = kindOf(r.type)
    if (!kind || seen.has(r.id)) continue
    seen.add(r.id)
    if (r.province === 'US') {
      national.set(kind, r.id)
      continue
    }
    races.push(toSummary(r, kind))
  }

  // The national summary races carry seat counts for seats not on the ballot.
  const chambers: ChamberTotals[] = await Promise.all(
    (['senate', 'house', 'governor'] as const).map(async (kind) => {
      const holdovers: Record<string, number> = {}
      const id = national.get(kind)
      if (id && kind !== 'house') {
        const detail = await civicGet<CivicRaceDetail>(`/race/${id}`).catch(() => null)
        for (const c of detail?.candidates ?? []) {
          if (c.seats && c.party) holdovers[c.party] = (holdovers[c.party] ?? 0) + c.seats
        }
      }
      return { kind, holdovers, totalSeats: CHAMBER_SIZE[kind] }
    }),
  )

  const partyColors: Record<string, string> = {}
  for (const race of races) {
    for (const c of race.candidates) partyColors[c.party] ??= c.color
  }

  setResponseHeader(event, 'cache-control', 'public, max-age=15')
  return { updatedAt: new Date().toISOString(), races, chambers, partyColors }
})
