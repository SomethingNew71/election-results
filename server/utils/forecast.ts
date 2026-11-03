import type { ForecastChamber, RaceKind } from '#shared/types'

/** civicAPI's forecast payload. Every field may be missing; parseForecast defaults each one. */
export interface CivicForecast {
  last_updated?: string
  totals?: { democrat?: number; republican?: number; tossup?: number; independent?: number } | null
  states?: Record<
    string,
    {
      rating?: string | null
      democrat_pct?: number | null
      republican_pct?: number | null
      independent_pct?: number | null
      incumbent_party?: string | null
      democratic?: string | null
      republican?: string | null
      independent?: string | null
    }
  > | null
  factor_weights?: Record<string, number> | null
  sources?: Record<string, string[]> | null
  monte_carlo?: {
    simulations?: number
    expected_democrat_seats?: number
    expected_republican_seats?: number
    democrat_seats_p5?: number
    democrat_seats_p50?: number
    democrat_seats_p95?: number
    republican_seats_p5?: number
    republican_seats_p50?: number
    republican_seats_p95?: number
    majority_threshold?: number
    prob_democrat_majority?: number
    prob_republican_majority?: number
  } | null
  majority_odds?: { rating?: string } | null
  distribution?: { bins?: { seats: number; probability: number; control?: string }[] } | null
  national?: {
    popular_vote?: { democrat_pct: number; republican_pct: number; margin?: number; districts_included: number; sources?: string[] }
    seat_share?: { democrat_pct: number; republican_pct: number }
    generic_ballot?: { democrat_pct: number; republican_pct: number; poll_count: number; confidence?: number }
  } | null
}

const num = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null)

/**
 * One chamber of civicAPI's forecast, reshaped for /forecast. Published
 * figures pass through unchanged, including ones that do not add up; a
 * missing figure stays null rather than becoming 0. `ids` maps
 * "kind|key" to our tracked race ids, for links to race pages.
 */
export function parseForecast(kind: RaceKind, threshold: number, d: CivicForecast, ids: Map<string, number[]>): ForecastChamber {
  const mc = d.monte_carlo
  const t = d.totals
  const n = d.national
  const seats =
    mc && [mc.democrat_seats_p5, mc.democrat_seats_p50, mc.democrat_seats_p95, mc.republican_seats_p5, mc.republican_seats_p50, mc.republican_seats_p95].every((x) => num(x) !== null)
      ? {
          simulations: num(mc.simulations),
          expectedDem: num(mc.expected_democrat_seats) ?? 0,
          expectedRep: num(mc.expected_republican_seats) ?? 0,
          dem: [mc.democrat_seats_p5!, mc.democrat_seats_p50!, mc.democrat_seats_p95!] as [number, number, number],
          rep: [mc.republican_seats_p5!, mc.republican_seats_p50!, mc.republican_seats_p95!] as [number, number, number],
        }
      : null
  return {
    kind,
    updated: d.last_updated ?? '',
    totals: t ? { dem: t.democrat ?? 0, rep: t.republican ?? 0, tossup: t.tossup ?? 0, ind: t.independent ?? 0 } : null,
    majorityThreshold: num(mc?.majority_threshold) ?? threshold,
    probDem: num(mc?.prob_democrat_majority),
    probRep: num(mc?.prob_republican_majority),
    chamberRating: d.majority_odds?.rating ?? null,
    seats,
    distribution: (d.distribution?.bins ?? []).filter((b) => num(b.seats) !== null && num(b.probability) !== null),
    weights: d.factor_weights ?? {},
    sources: d.sources ?? {},
    national: n
      ? {
          popularVote: n.popular_vote
            ? {
                dem: n.popular_vote.democrat_pct,
                rep: n.popular_vote.republican_pct,
                margin: num(n.popular_vote.margin),
                districts: n.popular_vote.districts_included,
                sources: n.popular_vote.sources ?? [],
              }
            : null,
          seatShare: n.seat_share ? { dem: n.seat_share.democrat_pct, rep: n.seat_share.republican_pct } : null,
          genericBallot: n.generic_ballot
            ? { dem: n.generic_ballot.democrat_pct, rep: n.generic_ballot.republican_pct, polls: n.generic_ballot.poll_count, confidence: num(n.generic_ballot.confidence) }
            : null,
        }
      : null,
    races: Object.entries(d.states ?? {}).map(([key, r]) => {
      const match = ids.get(`${kind}|${key}`)
      return {
        key,
        state: key.slice(0, 2),
        rating: r?.rating || 'Unrated',
        dem: num(r?.democrat_pct),
        rep: num(r?.republican_pct),
        ind: num(r?.independent_pct),
        incumbentParty: r?.incumbent_party ?? '',
        candidates: [
          { party: 'Democratic', name: r?.democratic ?? '' },
          { party: 'Republican', name: r?.republican ?? '' },
          { party: 'Independent', name: r?.independent ?? '' },
        ],
        raceId: match?.length === 1 ? match[0]! : null,
      }
    }),
  }
}
