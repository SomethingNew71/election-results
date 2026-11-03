import type { RaceSummary, VoteTypeBreakdown, VoteTypeCounts } from '#shared/types'
import { feedAdapter, feedKey, type FeedMap } from './stateFeeds'

/** A per-contest vote-type split is asked for at most this often. */
const TTL_MS = 60_000
/** A race page waits at most this long for a split, then shows the last copy. */
const BUDGET_MS = 1_500

const cache = new Map<string, { at: number; checkedAt: string; counts: VoteTypeCounts | null }>()
const pending = new Map<string, Promise<void>>()

/**
 * The state's count for one race split by vote type. Only for a race whose
 * state candidates matched civicAPI's (`crossCheck.matched`), so the split
 * belongs to this race. Inline splits (Delaware) come with the feed; others
 * are one request per contest, cached for TTL_MS and shared by every reader.
 */
export async function voteTypeBreakdown(
  race: RaceSummary,
  feeds: FeedMap,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<VoteTypeBreakdown | null> {
  if (!race.crossCheck?.matched) return null
  const hit = feeds.get(feedKey(race))
  if (!hit) return null
  const { race: feed, meta } = hit
  const wrap = (counts: VoteTypeCounts | null, checkedAt: string): VoteTypeBreakdown | null =>
    counts && counts.votes.length === feed.candidates.length
      ? { ...counts, candidates: feed.candidates.map((c) => c.name), source: meta.source, sourceUrl: meta.sourceUrl, checkedAt }
      : null
  if (feed.byType) return wrap(feed.byType, meta.checkedAt)

  const adapter = feedAdapter(feed.state)
  if (!adapter?.voteTypes || !feed.ref) return null
  const key = `${feed.state}|${feed.ref}`
  const cached = cache.get(key)
  if (!cached || Date.now() - cached.at >= TTL_MS) {
    let run = pending.get(key)
    if (!run) {
      // A failure also stamps the cache, so a broken endpoint is asked once a minute, not on every request.
      run = adapter
        .voteTypes(feed)
        .then((counts) => void cache.set(key, { at: Date.now(), checkedAt: new Date().toISOString(), counts }))
        .catch((err) => {
          cache.set(key, { at: Date.now(), checkedAt: cached?.checkedAt ?? '', counts: cached?.counts ?? null })
          console.warn(`Vote types for ${key} failed`, err)
        })
        .finally(() => pending.delete(key))
      pending.set(key, run)
      waitUntil?.(run)
    }
    await Promise.race([run, new Promise((resolve) => setTimeout(resolve, BUDGET_MS))])
  }
  const latest = cache.get(key)
  return latest ? wrap(latest.counts, latest.checkedAt) : null
}
