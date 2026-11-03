import type { ForecastChamber, RaceKind } from '#shared/types'
import { CHAMBER_SEATS, ratingStyle } from '../../shared/utils/forecast'
import { STATE_BY_POSTAL } from '../../shared/utils/states'

/** Rating strings already warned about, so a new spelling is logged once per object lifetime. */
const warned = new Set<string>()

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

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** Simulation figures that cannot all be true. */
function simulationIssues(kind: RaceKind, mc: CivicForecast['monte_carlo'], bins: { seats: number }[]): string[] {
  const seats = CHAMBER_SEATS[kind]
  const unit = kind === 'governor' ? 'governorships' : 'seats'
  const out: string[] = []
  const pd = num(mc?.prob_democrat_majority)
  const pr = num(mc?.prob_republican_majority)
  if (pd !== null && pr !== null && pd + pr > 100.5) {
    out.push(`It gives both parties a majority: ${fmt(pd)}% for Democrats and ${fmt(pr)}% for Republicans.`)
  }
  const md = num(mc?.democrat_seats_p50)
  const mr = num(mc?.republican_seats_p50)
  if (md !== null && mr !== null && md + mr > seats + 0.5) out.push(`Its median ${unit} add up to ${md + mr}; there are ${seats}.`)
  const ed = num(mc?.expected_democrat_seats)
  const er = num(mc?.expected_republican_seats)
  if (ed !== null && er !== null && ed + er > seats + 0.5) out.push(`Its expected ${unit} add up to ${fmt(ed + er)}; there are ${seats}.`)
  const top = Math.max(-Infinity, ...bins.map((b) => b.seats))
  if (top > seats) out.push(`Its seat distribution reaches ${top} ${unit}; there are ${seats}.`)
  return out
}

/**
 * One chamber of civicAPI's forecast, reshaped for /forecast. Race figures
 * pass through unchanged; a missing figure stays null rather than becoming 0.
 * Seat totals are `holdovers` (seats not up, by party) plus races counted by
 * rating, which is how civicAPI's own site shows them. Simulation figures that
 * cannot all be true are listed in `simulationIssues`, not corrected. `ids`
 * maps "kind|key" to our tracked race ids, for links to race pages.
 */
export function parseForecast(
  kind: RaceKind,
  threshold: number,
  d: CivicForecast,
  ids: Map<string, number[]>,
  holdovers: Record<string, number> = {},
): ForecastChamber {
  const mc = d.monte_carlo
  const t = d.totals
  const n = d.national
  const notUp = { dem: holdovers.Democratic ?? 0, rep: holdovers.Republican ?? 0, ind: holdovers.Independent ?? 0 }
  const totals = { ...notUp, tossup: 0, unrated: 0, notUp }
  for (const [key, r] of Object.entries(d.states ?? {})) {
    // A territory race would push the totals past the chamber size; it still lists in the race table.
    if (!STATE_BY_POSTAL.has(key.slice(0, 2))) continue
    const rating = r?.rating || 'Unrated'
    const party = ratingStyle(rating).party
    if (party === 'Democratic') totals.dem++
    else if (party === 'Republican') totals.rep++
    else if (party === 'Independent') totals.ind++
    else if (/^toss/i.test(rating)) totals.tossup++
    else {
      totals.unrated++
      if (rating !== 'Unrated' && !warned.has(rating)) {
        warned.add(rating)
        console.warn(`civicAPI forecast: unknown rating "${rating}" counted as unrated`)
      }
    }
  }
  const published = t ? { dem: t.democrat ?? 0, rep: t.republican ?? 0, tossup: t.tossup ?? 0, ind: t.independent ?? 0 } : null
  const sameAsPublished =
    !published || (published.dem === totals.dem && published.rep === totals.rep && published.tossup === totals.tossup && published.ind === totals.ind)
  const distribution = (d.distribution?.bins ?? []).filter((b) => num(b.seats) !== null && num(b.probability) !== null)
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
    totals,
    publishedTotals: sameAsPublished ? null : published,
    simulationIssues: simulationIssues(kind, mc, distribution),
    majorityThreshold: num(mc?.majority_threshold) ?? threshold,
    probDem: num(mc?.prob_democrat_majority),
    probRep: num(mc?.prob_republican_majority),
    chamberRating: d.majority_odds?.rating ?? null,
    seats,
    distribution,
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
