import type { ForecastChamber, ForecastData, ForecastNational, RaceKind } from '#shared/types'

/**
 * civicAPI's 2026 forecast, reshaped for /forecast. Published figures are
 * passed through unchanged, including any that do not add up; the page says so.
 */
interface CivicForecastRace {
  rating: string
  democrat_pct: number | null
  republican_pct: number | null
  independent_pct: number | null
  incumbent_party: string
  democratic: string
  republican: string
  independent: string
}
interface CivicForecast {
  last_updated: string
  totals: { democrat: number; republican: number; tossup: number; independent: number }
  states: Record<string, CivicForecastRace>
  factor_weights?: Record<string, number>
  sources?: Record<string, string[]>
  monte_carlo?: {
    simulations: number
    expected_democrat_seats: number
    expected_republican_seats: number
    democrat_seats_p5: number
    democrat_seats_p50: number
    democrat_seats_p95: number
    republican_seats_p5: number
    republican_seats_p50: number
    republican_seats_p95: number
    majority_threshold?: number
    prob_democrat_majority: number
    prob_republican_majority: number
  }
  distribution?: { bins?: { seats: number; probability: number; control: string }[] }
  national?: {
    popular_vote?: { democrat_pct: number; republican_pct: number; districts_included: number; sources: string[] }
    seat_share?: { democrat_pct: number; republican_pct: number }
    generic_ballot?: { democrat_pct: number; republican_pct: number; poll_count: number }
  }
}

const CHAMBERS: { kind: RaceKind; path: string; threshold: number }[] = [
  { kind: 'senate', path: 'senate', threshold: 51 },
  { kind: 'house', path: 'house', threshold: 218 },
  // civicAPI publishes no threshold for governors; a majority of 50 states is 26.
  { kind: 'governor', path: 'governor', threshold: 26 },
]

export default defineEventHandler(async (event): Promise<ForecastData | Response> => {
  const forwarded = await viaSnapshot(event)
  if (forwarded) return forwarded

  const waitUntil = (p: Promise<unknown>) => event.waitUntil(p)
  const [tracked, ...fetched] = await Promise.all([
    // Only for links to race pages; the forecast still shows without them.
    trackedRaces(waitUntil).then(
      (t) => t.races,
      () => [],
    ),
    ...CHAMBERS.map((c) => civicGet<CivicForecast>(`/forecast/${c.path}/2026/civicapi`, waitUntil)),
  ])

  // Link a forecast race to our page only when the match is unambiguous (two Senate races in one state are not).
  const ids = new Map<string, number[]>()
  for (const r of tracked) {
    const key = `${r.kind}|${r.kind === 'house' ? r.district : r.state}`
    ids.set(key, [...(ids.get(key) ?? []), r.id])
  }

  let national: ForecastNational | null = null
  const chambers: ForecastChamber[] = CHAMBERS.map((c, i) => {
    const d = fetched[i]!.data
    const mc = d.monte_carlo
    if (d.national) {
      const n = d.national
      national = {
        popularVote: n.popular_vote
          ? { dem: n.popular_vote.democrat_pct, rep: n.popular_vote.republican_pct, districts: n.popular_vote.districts_included, sources: n.popular_vote.sources ?? [] }
          : null,
        seatShare: n.seat_share ? { dem: n.seat_share.democrat_pct, rep: n.seat_share.republican_pct } : null,
        genericBallot: n.generic_ballot
          ? { dem: n.generic_ballot.democrat_pct, rep: n.generic_ballot.republican_pct, polls: n.generic_ballot.poll_count }
          : null,
      }
    }
    return {
      kind: c.kind,
      updated: d.last_updated,
      totals: { dem: d.totals.democrat, rep: d.totals.republican, tossup: d.totals.tossup, ind: d.totals.independent },
      majorityThreshold: mc?.majority_threshold ?? c.threshold,
      probDem: mc?.prob_democrat_majority ?? null,
      probRep: mc?.prob_republican_majority ?? null,
      seats: mc
        ? {
            simulations: mc.simulations,
            expectedDem: mc.expected_democrat_seats,
            expectedRep: mc.expected_republican_seats,
            dem: [mc.democrat_seats_p5, mc.democrat_seats_p50, mc.democrat_seats_p95],
            rep: [mc.republican_seats_p5, mc.republican_seats_p50, mc.republican_seats_p95],
          }
        : null,
      distribution: d.distribution?.bins ?? [],
      weights: d.factor_weights ?? {},
      sources: d.sources ?? {},
      races: Object.entries(d.states).map(([key, r]) => {
        const match = ids.get(`${c.kind}|${key}`)
        return {
          key,
          state: key.slice(0, 2),
          rating: r.rating,
          dem: r.democrat_pct ?? 0,
          rep: r.republican_pct ?? 0,
          ind: r.independent_pct ?? 0,
          incumbentParty: r.incumbent_party,
          candidates: [
            { party: 'Democratic', name: r.democratic },
            { party: 'Republican', name: r.republican },
            { party: 'Independent', name: r.independent },
          ].filter((x) => x.name),
          raceId: match?.length === 1 ? match[0]! : null,
        }
      }),
    }
  })

  const oldest = Math.min(...fetched.map((f) => f.fetchedAt))
  setResponseHeader(event, 'cache-control', 'public, max-age=60')
  return { chambers, national, dataAsOf: new Date(oldest).toISOString(), stale: fetched.some((f) => f.stale) }
})
