import type { CrossCheck, FeedRace, RaceSummary } from '../types'

/**
 * Matching key for a candidate: the last name of the first person on the
 * ticket. "Zach Lahn and Derek Wulf" and "Victor Marx / George Markert" both
 * key on the governor candidate; suffixes and nicknames are dropped.
 */
export function personKey(name: string): string {
  const first = name.split(/\s+(?:\/|and|&)\s+/i)[0] ?? name
  const words = first
    .replace(/["“”'‘’(].*?["“”'‘’)]/g, ' ')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^a-z-]/g, ''))
    .filter((w) => w && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(w))
  return words.at(-1) ?? ''
}

function isWriteIn(name: string): boolean {
  return /write[\s-]?in/i.test(name)
}

/** Unmatched feed candidates may hold at most this share of the feed total. */
const UNMATCHED_LIMIT = 0.01

/**
 * Cross-check a civicAPI race against an official state feed. Counts never
 * get averaged: both sources read the same official tally, so when the
 * candidate lists match and the state feed has counted more votes, its
 * numbers replace civicAPI's. Otherwise civicAPI stays and the feed is shown
 * for comparison only.
 */
export function mergeFeed(
  race: RaceSummary,
  feed: FeedRace,
  meta: { source: string; sourceUrl: string; fetchedAt: string; version: string | null },
): RaceSummary {
  const feedByKey = new Map<string, number>()
  for (const c of feed.candidates) {
    if (isWriteIn(c.name)) continue
    const key = personKey(c.name)
    feedByKey.set(key, (feedByKey.get(key) ?? 0) + c.votes)
  }
  const feedTotal = feed.candidates.reduce((n, c) => n + c.votes, 0)
  const civicTotal = race.candidates.reduce((n, c) => n + c.votes, 0)

  const used = new Set<string>()
  const differences: CrossCheck['differences'] = []
  // civicAPI lists registered write-in candidates that state feeds often omit.
  // Those may go unmatched while they stay minor; they keep civicAPI's count.
  let unmatchedCivicVotes = 0
  for (const c of race.candidates) {
    const key = personKey(c.name)
    if (isWriteIn(c.name)) continue
    if (!feedByKey.has(key)) {
      unmatchedCivicVotes += c.votes
      continue
    }
    used.add(key)
    differences.push({ name: c.name, civic: c.votes, feed: feedByKey.get(key)! })
  }
  const unmatchedFeedVotes = feed.candidates
    .filter((c) => !isWriteIn(c.name) && !used.has(personKey(c.name)))
    .reduce((n, c) => n + c.votes, 0)
  const matched =
    differences.length >= 2 &&
    unmatchedCivicVotes <= civicTotal * UNMATCHED_LIMIT &&
    unmatchedFeedVotes <= feedTotal * UNMATCHED_LIMIT

  const useFeed = matched && feedTotal > civicTotal
  const unitsPct = feed.unitsTotal > 0 ? (feed.unitsReporting / feed.unitsTotal) * 100 : 0

  const crossCheck: CrossCheck = {
    ...meta,
    feedTotal,
    civicTotal,
    unitsReporting: feed.unitsReporting,
    unitsTotal: feed.unitsTotal,
    matched,
    used: useFeed,
    differences,
  }

  if (!useFeed) return { ...race, crossCheck }

  // Scale civicAPI's reporting estimate by how much further the state count is.
  // With nothing from civicAPI yet, the share of counties reporting is the only guide.
  const pct =
    race.pct >= 100
      ? 100
      : civicTotal > 0
        ? Math.min(99, (race.pct * feedTotal) / civicTotal)
        : Math.min(99, unitsPct)

  return {
    ...race,
    pct,
    pctEstimated: true,
    candidates: race.candidates.map((c) =>
      isWriteIn(c.name) ? c : { ...c, votes: feedByKey.get(personKey(c.name)) ?? c.votes },
    ),
    crossCheck,
  }
}
