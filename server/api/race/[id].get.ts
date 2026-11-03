import type { RaceDetail } from '#shared/types'
import type { CivicRaceDetail } from '../../utils/civic'

export default defineEventHandler(async (event): Promise<RaceDetail> => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid race id' })
  }

  const d = await civicGet<CivicRaceDetail>(`/race/${id}`)
  const kind = kindOf(d.election_type)
  if (!kind || d.province === 'US') {
    throw createError({ statusCode: 404, statusMessage: 'Race not tracked' })
  }

  setResponseHeader(event, 'cache-control', 'public, max-age=15')
  return {
    ...toSummary(
      {
        id,
        type: d.election_type,
        province: d.province,
        district: d.district,
        election_name: d.election_name,
        election_type: d.election_scope,
        percent_reporting: d.percent_reporting,
        candidates: d.candidates,
      },
      kind,
    ),
    pollsClose: d.polls_close,
    lastUpdated: d.last_updated,
    registeredVoters: d.registered_voters,
    regions: toRegions(d),
  }
})
