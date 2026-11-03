import type { RaceSummary, VoteTypeBreakdown } from '#shared/types'
import { feedAdapter, feedKey, type FeedMap } from './stateFeeds'

/** A per-contest vote-type split is asked for at most this often. */
const TTL_MS = 60_000
/** With no copy yet, a race page waits at most this long for a split. */
const BUDGET_MS = 1_500
/** Splits fetched at once per state; a Virginia contest is about 2 MB to parse. */
const MAX_PARALLEL = 2

type Split = Omit<VoteTypeBreakdown, 'source' | 'sourceUrl'>
const cache = new Map<string, { at: number; split: Split | null }>()
const pending = new Map<string, Promise<void>>()
const active = new Map<string, number>()

/**
 * The state's count for one race split by vote type. Only for a race whose
 * state candidates matched civicAPI's (`crossCheck.matched`), so the split
 * belongs to this race. Inline splits (Delaware) come with the feed; others
 * are one request per contest, cached for TTL_MS and shared by every reader.
 * A cached copy is returned at once and refreshed in the background. Each
 * copy keeps the candidate names its rows were lined up with, so a feed that
 * reorders its candidates between refreshes cannot mislabel a row.
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
  const out = (split: Split | null | undefined) => (split ? { ...split, source: meta.source, sourceUrl: meta.sourceUrl } : null)
  if (feed.byType) {
    return out({ ...feed.byType, candidates: feed.candidates.map((c) => c.name), checkedAt: meta.checkedAt })
  }

  const adapter = feedAdapter(feed.state)
  if (!adapter?.voteTypes || !feed.ref) return null
  const key = `${feed.state}|${feed.ref}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < TTL_MS) return out(cached.split)

  let run = pending.get(key)
  if (!run && (active.get(feed.state) ?? 0) < MAX_PARALLEL) {
    const candidates = feed.candidates.map((c) => c.name)
    active.set(feed.state, (active.get(feed.state) ?? 0) + 1)
    run = adapter
      .voteTypes(feed)
      .then((counts) => {
        const split = counts && counts.votes.length === candidates.length ? { ...counts, candidates, checkedAt: new Date().toISOString() } : null
        cache.set(key, { at: Date.now(), split })
      })
      .catch((err) => {
        // Keep the last copy, and wait a full TTL before asking a failing endpoint again.
        cache.set(key, { at: Date.now(), split: cached?.split ?? null })
        console.warn(`Vote types for ${key} failed`, err)
      })
      .finally(() => {
        pending.delete(key)
        active.set(feed.state, (active.get(feed.state) ?? 1) - 1)
      })
    pending.set(key, run)
    waitUntil?.(run)
  }
  if (cached) return out(cached.split)
  if (run) {
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([run, new Promise((resolve) => (timer = setTimeout(resolve, BUDGET_MS)))])
    clearTimeout(timer)
  }
  return out(cache.get(key)?.split)
}
