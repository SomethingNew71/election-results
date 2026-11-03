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

/**
 * A fingerprint of every count, for feeds that publish no version stamp. It
 * changes on any change, including a correction that lowers a total.
 */
export function countsFingerprint(races: { state: string; kind: string; district: string | null; candidates: { name: string; votes: number }[] }[]): number {
  const text = races.map((r) => `${r.kind}${r.district}:${r.candidates.map((c) => `${c.name}=${c.votes}`).join(',')}`).join('|')
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

export function totalVotes(races: { candidates: { votes: number }[] }[]): number {
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
  /** The version is a fingerprint, not ordered: any different value is newer. */
  unordered?: boolean
  /** Omitted when the version shows nothing changed. */
  races?: import('#shared/types').FeedRace[]
}

export interface FeedAdapter {
  state: string
  source: string
  /** Public page a reader can check. */
  sourceUrl: string
  load(prevVersion: number | null): Promise<FeedLoad>
  /** Votes by type for one race, from a per-contest request (`race.ref`). Null when the feed has no split. */
  voteTypes?(race: import('#shared/types').FeedRace): Promise<import('#shared/types').VoteTypeCounts | null>
}

/**
 * Lines up per-candidate vote-type rows with a race's candidates by name.
 * Write-ins are summed into "Write-in". Null when a named candidate is missing,
 * so a changed feed shows no split rather than a wrong one.
 */
export function alignByName(
  candidates: { name: string }[],
  rows: { name: string; writeIn: boolean; votes: number[] }[],
  types: number,
): number[][] | null {
  const byName = new Map<string, number[]>()
  for (const r of rows) {
    const key = r.writeIn ? 'Write-in' : r.name
    const sum = byName.get(key) ?? new Array<number>(types).fill(0)
    r.votes.forEach((v, i) => (sum[i]! += Number(v) || 0))
    byName.set(key, sum)
  }
  const out: number[][] = []
  for (const c of candidates) {
    const v = byName.get(c.name)
    if (!v) return null
    out.push(v)
  }
  return out
}
