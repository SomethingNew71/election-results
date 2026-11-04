import type { FeedRace } from '#shared/types'
import { getJson, type FeedAdapter } from './http'

/**
 * Indiana Election Division results (enr.indianavoters.in.gov), the "EnrApp"
 * JSON files behind the public page. Indiana has only US House races in 2026.
 * `data/settings.json` carries `VersionCode` ("20261103_200059"), which is the
 * version. `OffCatC_<id>_<VersionType>.json` holds the statewide totals of one
 * office category (about 115 KB for US Representative, with a county
 * breakdown we ignore). Precinct counts are statewide only.
 */
const BASE = 'https://enr.indianavoters.in.gov/site/data'

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh']

export interface IndianaSettings {
  Root?: { VersionCode?: string; VersionType?: string; ElectionType?: string; CurrentElection?: string }
}

export interface IndianaList {
  Root?: {
    JurisdictionsReporting?: { TOTAL_ALLPRECINCTSREPORTING?: string; TOTAL_ALLPRECINCTS?: string }
    List?: { Items?: { Item?: { OFFICECATEGORYID: string; OFFICE_CATEGORY_NAME: string }[] } }[]
  }
}

export interface IndianaOffice {
  Root?: {
    StatewideSummary?: {
      Race?: {
        OFFICE_TITLE: string
        Candidates?: { Candidate?: { NAME_ON_BALLOT: string; TOTAL: number | string }[] }
      }[]
    }
  }
}

/** "United States Representative, Fifth District" → IN-05. */
export function indianaDistrict(title: string): string | null {
  const m = title.match(/^United States Representative, (\w+) District$/i)
  const i = m ? ORDINALS.indexOf(m[1]!.toLowerCase()) : -1
  return i < 0 ? null : `IN-${String(i + 1).padStart(2, '0')}`
}

export function parseIndiana(office: IndianaOffice, precincts: { reporting: number; total: number }): FeedRace[] {
  const out: FeedRace[] = []
  for (const race of office.Root?.StatewideSummary?.Race ?? []) {
    const district = indianaDistrict(race.OFFICE_TITLE ?? '')
    if (!district) continue
    const candidates: { name: string; votes: number }[] = []
    let writeIn = 0
    let hasWriteIn = false
    for (const c of race.Candidates?.Candidate ?? []) {
      const votes = Number(c.TOTAL) || 0
      // Unnamed write-ins fold into one row. Certified write-in candidates keep their name.
      if (/^(unnamed )?write-?ins?$/i.test(c.NAME_ON_BALLOT.trim())) {
        writeIn += votes
        hasWriteIn = true
      } else candidates.push({ name: c.NAME_ON_BALLOT.replace(/\s*\(W\/I\)\s*$/i, '').trim(), votes })
    }
    if (hasWriteIn) candidates.push({ name: 'Write-in', votes: writeIn })
    out.push({
      state: 'IN',
      kind: 'house',
      district,
      candidates,
      unitsReporting: precincts.reporting,
      unitsTotal: precincts.total,
      unitLabel: 'precincts statewide',
    })
  }
  return out
}

export const in_: FeedAdapter = {
  state: 'IN',
  source: 'Indiana Election Division',
  sourceUrl: 'https://enr.indianavoters.in.gov/',
  async load(prevVersion) {
    const settings = (await getJson<IndianaSettings>(`${BASE}/settings.json`, this.source)).Root
    const stamp = Number(String(settings?.VersionCode ?? '').replace(/\D/g, ''))
    if (!stamp) throw new Error(`${this.source}: no VersionCode`)
    if (prevVersion != null && stamp <= prevVersion) return { version: stamp }
    const type = settings?.VersionType ?? 'B'
    const list = (await getJson<IndianaList>(`${BASE}/statewideElectionsC_${type}.json`, this.source)).Root
    const items = (list?.List ?? []).flatMap((h) => h.Items?.Item ?? [])
    const house = items.find((i) => /^US Representative$/i.test(i.OFFICE_CATEGORY_NAME))
    if (!house) throw new Error(`${this.source}: no US Representative category`)
    const office = await getJson<IndianaOffice>(`${BASE}/OffCatC_${house.OFFICECATEGORYID}_${type}.json`, this.source)
    const jr = list?.JurisdictionsReporting
    const races = parseIndiana(office, {
      reporting: Number(jr?.TOTAL_ALLPRECINCTSREPORTING) || 0,
      total: Number(jr?.TOTAL_ALLPRECINCTS) || 0,
    })
    return { version: stamp, races }
  },
}
