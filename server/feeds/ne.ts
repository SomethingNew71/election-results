import type { FeedRace } from '#shared/types'
import { USER_AGENT } from '../utils/civic'
import { countsFingerprint, type FeedAdapter } from './http'

/**
 * Nebraska Secretary of State unofficial results (electionresults.nebraska.gov).
 * The site has no data file, only server-rendered ASP.NET pages, so this reads
 * the HTML of two pages: statewide contests (about 95 KB) and US House
 * (about 65 KB). Each contest is a `display-results-box-a` heading, a
 * "Precincts Fully: a / b" line, and one `display-results-box-d` (name) /
 * `display-results-box-f` (votes) pair per candidate. The page has no
 * version stamp (its "Results last updated" text is minute-level), so a
 * fingerprint of the counts stands in. Governor rows name the ticket
 * ("Jim Pillen and Joe Kelly"); only the first name is kept.
 */
const BASE = 'https://electionresults.nebraska.gov/resultsSW.aspx'
const PAGES = [`${BASE}?type=SW&map=CTY`, `${BASE}?type=CG&map=DIST`]

const clean = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

export function nebraskaKind(heading: string): { kind: 'senate' | 'governor' | 'house'; district: string | null } | null {
  if (/^For United States Senator\b/i.test(heading)) return { kind: 'senate', district: null }
  if (/^For Governor\b/i.test(heading)) return { kind: 'governor', district: null }
  const m = heading.match(/^For Representative in Congress\b.*District (\d+)$/i)
  return m ? { kind: 'house', district: `NE-${m[1]!.padStart(2, '0')}` } : null
}

export function parseNebraska(html: string): FeedRace[] {
  const out: FeedRace[] = []
  const heads = [...html.matchAll(/<h1>\s*(For [^<]*?)\s*<\/h1>/g)]
  heads.forEach((h, i) => {
    const kind = nebraskaKind(clean(h[1]!))
    if (!kind) return
    const section = html.slice(h.index!, heads[i + 1]?.index ?? html.length)
    const fully = section.match(/Precincts Fully:\s*([\d,]+)\s*\/\s*([\d,]+)/i)
    const candidates: { name: string; votes: number }[] = []
    let writeIn = 0
    let hasWriteIn = false
    const re = /display-results-box-d">\s*<h1>([^<]*)<\/h1>[\s\S]*?display-results-box-f">\s*<h1>\s*([\d,]*)\s*<\/h1>/g
    for (const m of section.matchAll(re)) {
      const name = clean(m[1]!).replace(/ and .+$/, '')
      const votes = Number((m[2] ?? '').replace(/,/g, '')) || 0
      if (/write.?in/i.test(name)) {
        writeIn += votes
        hasWriteIn = true
      } else candidates.push({ name, votes })
    }
    if (hasWriteIn) candidates.push({ name: 'Write-in', votes: writeIn })
    if (!candidates.length) return
    out.push({
      state: 'NE',
      ...kind,
      candidates,
      unitsReporting: fully ? Number(fully[1]!.replace(/,/g, '')) : 0,
      unitsTotal: fully ? Number(fully[2]!.replace(/,/g, '')) : 0,
      unitLabel: 'precincts',
    })
  })
  return out
}

async function getHtml(url: string, source: string): Promise<string> {
  const res = await fetch(url, { headers: { accept: 'text/html', 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8_000) })
  if (!res.ok) throw new Error(`${source}: ${res.status} for ${url}`)
  return await res.text()
}

export const ne: FeedAdapter = {
  state: 'NE',
  source: 'Nebraska Secretary of State',
  sourceUrl: 'https://electionresults.nebraska.gov/',
  async load() {
    const pages = await Promise.all(PAGES.map((u) => getHtml(u, this.source)))
    const races = pages.flatMap(parseNebraska)
    if (!races.length) throw new Error(`${this.source}: no contests parsed`)
    return { version: countsFingerprint(races), unordered: true, races }
  },
}
