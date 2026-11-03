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

export function isWriteIn(name: string): boolean {
  return /write[\s-]?in/i.test(name)
}

/** Unmatched candidates on either side may hold at most this share of that side's total. */
const UNMATCHED_LIMIT = 0.01

function hasDuplicateKeys(names: string[]): boolean {
  const keys = names.filter((n) => !isWriteIn(n)).map(personKey)
  return new Set(keys).size !== keys.length
}

/**
 * Cross-check a civicAPI race against an official state feed. Counts are
 * never averaged: both sources read the same official tally, so when the
 * candidate lists match and the state has counted more votes, the state's
 * numbers replace civicAPI's. Otherwise civicAPI stays and the feed is shown
 * for comparison only.
 *
 * Reporting % always stays civicAPI's. A state's "units reporting" counts
 * counties with any result, not the share of votes counted, and scaling the
 * percentage would make leads look safer than they are. Keeping civicAPI's
 * lower figure with the state's higher count overestimates the votes left,
 * which errs toward "Competitive", never toward "Out of reach".
 */
export function mergeFeed(
  race: RaceSummary,
  feed: FeedRace,
  meta: { source: string; sourceUrl: string; fetchedAt: string; version: string | null },
): RaceSummary {
  const feedByKey = new Map<string, number>()
  let feedWriteIns = 0
  for (const c of feed.candidates) {
    if (isWriteIn(c.name)) feedWriteIns += c.votes
    else feedByKey.set(personKey(c.name), c.votes)
  }
  const feedTotal = feed.candidates.reduce((n, c) => n + c.votes, 0)
  const civicTotal = race.candidates.reduce((n, c) => n + c.votes, 0)

  const used = new Set<string>()
  const differences: CrossCheck['differences'] = []
  // civicAPI lists registered write-in candidates that state feeds often omit.
  // Those may go unmatched while they stay minor.
  let unmatchedCivicVotes = 0
  for (const c of race.candidates) {
    if (isWriteIn(c.name)) continue
    const key = personKey(c.name)
    if (!feedByKey.has(key)) {
      unmatchedCivicVotes += c.votes
      continue
    }
    used.add(key)
    differences.push({ name: c.name, civic: c.votes, feed: feedByKey.get(key)! })
  }
  const unmatchedFeedVotes = [...feedByKey.entries()].filter(([k]) => !used.has(k)).reduce((n, [, v]) => n + v, 0)

  // Two candidates with one surname in a race would get each other's votes.
  const ambiguous = hasDuplicateKeys(race.candidates.map((c) => c.name)) || hasDuplicateKeys(feed.candidates.map((c) => c.name))
  const matched =
    !ambiguous &&
    differences.length >= 2 &&
    unmatchedCivicVotes <= civicTotal * UNMATCHED_LIMIT &&
    unmatchedFeedVotes <= feedTotal * UNMATCHED_LIMIT

  const useFeed = matched && feedTotal > civicTotal
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

  // Every count shown comes from the state: write-ins take the state's
  // write-in total, and candidates the state does not list show 0.
  let writeInGiven = false
  return {
    ...race,
    candidates: race.candidates.map((c) => {
      if (isWriteIn(c.name)) {
        const votes = writeInGiven ? 0 : feedWriteIns
        writeInGiven = true
        return { ...c, votes }
      }
      return { ...c, votes: feedByKey.get(personKey(c.name)) ?? 0 }
    }),
    crossCheck,
  }
}
