import { USER_AGENT } from '../utils/civic'

const TIMEOUT_MS = 8_000

/** GET JSON from a state feed with our descriptive User-Agent and a timeout. */
export async function getJson<T>(url: string, source: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${source}: ${res.status} for ${url}`)
  return (await res.json()) as T
}

/** Total votes across races: the version for feeds that publish no version stamp. */
export function votesVersion(races: { candidates: { votes: number }[] }[]): number {
  return races.reduce((n, r) => n + r.candidates.reduce((m, c) => m + c.votes, 0), 0)
}

/** "8,834" or "0 (0%)" → 8834 / 0. */
export function leadingInt(s: string | number | null | undefined): number {
  if (typeof s === 'number') return s
  const m = String(s ?? '').match(/^[\d,]+/)
  return m ? Number(m[0].replace(/,/g, '')) : 0
}

export interface FeedLoad {
  /** Higher means newer. A load whose version is not higher than the last one is ignored. */
  version: number
  /** Omitted when the version shows nothing changed. */
  races?: import('#shared/types').FeedRace[]
}

export interface FeedAdapter {
  state: string
  source: string
  /** Public page a reader can check. */
  sourceUrl: string
  load(prevVersion: number | null): Promise<FeedLoad>
}
