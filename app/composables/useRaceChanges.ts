import type { RaceSummary } from '#shared/types'
import type { InferenceStatus } from '#shared/utils/inference'
import { STATUS_LABEL } from '#shared/utils/inference'

export interface RaceChange {
  id: number
  raceId: number
  label: string
  text: string
  at: number
  color: string | null
}

interface Seen {
  leader: string | null
  status: InferenceStatus
  winner: string | null
}

/** A row stays marked as changed for this long. */
export const CHANGE_MARK_MS = 2 * 60_000
const MAX_EVENTS = 30
/** Moves into or out of these statuses happen to hundreds of races at poll closing; they are not listed. */
/** Module-level so ids stay unique when the page is left and opened again. */
let nextId = 0
const QUIET = new Set<InferenceStatus>(['no-votes', 'early', 'called'])

/**
 * Compares each poll with the one before it and records factual changes:
 * a different candidate ahead, a winner flag from civicAPI, or a new status
 * once a race is past "Too early".
 * The first load records nothing. Changes are kept for this page view only.
 */
export function useRaceChanges(items: Ref<{ race: RaceSummary; inf: { status: InferenceStatus; leader: { name: string; color: string } | null } }[]>) {
  const events = useState<RaceChange[]>('race-changes', () => [])
  const changedAt = useState<Record<number, number>>('race-changed-at', () => ({}))
  const seen = new Map<number, Seen>()

  watch(
    items,
    (list) => {
      if (import.meta.server) return
      const now = Date.now()
      const fresh: RaceChange[] = []
      for (const { race, inf } of list) {
        const winner = race.candidates.find((c) => c.winner)?.name ?? null
        const current: Seen = { leader: inf.status === 'no-votes' ? null : (inf.leader?.name ?? null), status: inf.status, winner }
        const prev = seen.get(race.id)
        seen.set(race.id, current)
        if (!prev) continue
        const label = race.district ?? `${stateName(race.state)} ${race.kind === 'governor' ? 'Governor' : race.kind === 'senate' ? 'Senate' : ''}`.trim()
        const push = (text: string) => fresh.push({ id: nextId++, raceId: race.id, label, text, at: now, color: inf.leader?.color ?? null })
        if (current.winner && current.winner !== prev.winner) push(`civicAPI marked ${current.winner} as the winner`)
        else if (current.leader && prev.leader && current.leader !== prev.leader) push(`${current.leader} moved ahead of ${prev.leader}`)
        else if (current.status !== prev.status && !QUIET.has(prev.status) && !QUIET.has(current.status))
          push(`${STATUS_LABEL[prev.status]} → ${STATUS_LABEL[current.status]}`)
      }
      if (!fresh.length) return
      events.value = [...fresh.reverse(), ...events.value].slice(0, MAX_EVENTS)
      const marks = { ...changedAt.value }
      for (const e of fresh) marks[e.raceId] = now
      changedAt.value = marks
    },
    { immediate: true },
  )

  return { events, changedAt }
}
