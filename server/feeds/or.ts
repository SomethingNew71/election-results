import type { FeedRace, RaceKind } from '#shared/types'
import { countsFingerprint, type FeedAdapter } from './http'
import { USER_AGENT } from '../utils/civic'

/**
 * Oregon Secretary of State election night results (results.oregonvotes.gov).
 * The site has no data file a Worker can fetch (exports are ASP.NET postbacks),
 * so this reads the server-rendered statewide pages: `type=FED` (US Senator and
 * US Representative) and `type=SWPAR` (Governor). About 140 KB in two requests.
 * The page stamp is a local-time string without a zone, so a fingerprint of
 * the counts stands in for a version.
 */
const BASE = 'https://results.oregonvotes.gov/resultsSW.aspx?map=CTY&type='
const PAGES = ['FED', 'SWPAR']

const ORDINAL = /^US Representative, (\d+)(?:st|nd|rd|th) District$/i

export function orKind(title: string): { kind: RaceKind; district: string | null } | null {
  const t = title.trim()
  if (/^US Senator$/i.test(t)) return { kind: 'senate', district: null }
  if (/^Governor$/i.test(t)) return { kind: 'governor', district: null }
  const m = t.match(ORDINAL)
  return m ? { kind: 'house', district: `OR-${m[1]!.padStart(2, '0')}` } : null
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()

/** Parses one results page. Each contest starts at a `display-results-box-a` heading. */
export function parseOr(html: string): FeedRace[] {
  const out: FeedRace[] = []
  const parts = html.split(/<div class="display-results-box-a">/).slice(1)
  for (const part of parts) {
    const title = part.match(/<h1>([^<]*)<\/h1>/)?.[1]
    const kind = title ? orKind(decode(title)) : null
    if (!kind) continue
    const precincts = part.match(/(\d[\d,]*)\s+out of\s+(\d[\d,]*)\s+Precincts/i)
    const candidates: { name: string; votes: number }[] = []
    const re = /display-results-box-d">\s*<h1>([^<]*)<\/h1>[\s\S]*?display-results-box-f">\s*<div>([^<]*)<\/div>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(part))) {
      const name = decode(m[1]!)
      const votes = Number(m[2]!.replace(/,/g, '')) || 0
      if (/^write-?in/i.test(name)) {
        const w = candidates.find((c) => c.name === 'Write-in')
        if (w) w.votes += votes
        else candidates.push({ name: 'Write-in', votes })
      } else candidates.push({ name, votes })
    }
    if (!candidates.length) continue
    out.push({
      state: 'OR',
      ...kind,
      candidates,
      unitsReporting: Number(precincts?.[1]?.replace(/,/g, '')) || 0,
      unitsTotal: Number(precincts?.[2]?.replace(/,/g, '')) || 0,
      unitLabel: 'precincts',
    })
  }
  return out
}

async function getHtml(type: string, source: string): Promise<string> {
  const res = await fetch(BASE + type, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) })
  if (!res.ok) throw new Error(`${source}: ${res.status} for ${BASE + type}`)
  return res.text()
}

export const or_: FeedAdapter = {
  state: 'OR',
  source: 'Oregon Secretary of State',
  sourceUrl: 'https://results.oregonvotes.gov/',
  async load() {
    const pages = await Promise.all(PAGES.map((p) => getHtml(p, this.source)))
    const races = pages.flatMap(parseOr)
    if (!races.length) throw new Error(`${this.source}: no contests found`)
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
