<script setup lang="ts">
import type { ChamberTotals, RaceSummary } from '#shared/types'

const props = defineProps<{
  chamber: ChamberTotals
  races: RaceSummary[]
}>()

interface Segment {
  party: string
  color: string
  holdover: number
  called: number
  leading: number
}

const segments = computed<Segment[]>(() => {
  const map = new Map<string, Segment>()
  const seg = (party: string) => {
    if (!map.has(party)) map.set(party, { party, color: partyColor(party), holdover: 0, called: 0, leading: 0 })
    return map.get(party)!
  }
  // Both main parties always show, even at zero, so their positions never move.
  seg(LEFT_PARTY)
  seg(RIGHT_PARTY)
  for (const [party, n] of Object.entries(props.chamber.holdovers)) seg(party).holdover += n
  for (const race of props.races) {
    const inf = inferRace(race.candidates, race.pct, undefined, rulesFor(race.state, race.kind))
    if (!inf.leader || inf.status === 'no-votes') continue
    const s = seg(inf.leader.party)
    if (inf.status === 'called') s.called++
    else s.leading++
  }
  return [...map.values()]
})

const seats = (s: Segment) => s.holdover + s.called + s.leading
const left = computed(() => segments.value.find((s) => s.party === LEFT_PARTY)!)
const right = computed(() => segments.value.find((s) => s.party === RIGHT_PARTY)!)
const others = computed(() => segments.value.filter((s) => s !== left.value && s !== right.value && seats(s) > 0))
const accounted = computed(() => segments.value.reduce((n, s) => n + seats(s), 0))
const undecided = computed(
  () => Math.max(0, props.chamber.totalSeats - accounted.value) + segments.value.reduce((n, s) => n + s.leading, 0),
)
const showMajority = computed(() => props.chamber.kind !== 'governor')
const majority = computed(() => Math.floor(props.chamber.totalSeats / 2) + 1)
const pct = (n: number) => `${(n / props.chamber.totalSeats) * 100}%`
</script>

<template>
  <div>
    <div class="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
      <div v-for="s in [left, ...others, right]" :key="s.party" class="min-w-0">
        <div class="kicker truncate">{{ s.party }}</div>
        <div class="num text-2xl font-semibold" :style="{ color: s.color }">{{ s.holdover + s.called }}</div>
        <div class="num text-muted text-xs">
          <template v-if="s.holdover">{{ s.holdover }} not up · </template>{{ s.called }} called · {{ s.leading }} leading
        </div>
      </div>
      <div class="sm:text-right">
        <div class="kicker">Not yet called</div>
        <div class="num text-2xl font-semibold">{{ undecided }}</div>
        <div v-if="showMajority" class="num text-muted text-xs">{{ majority }} for a majority</div>
      </div>
    </div>
    <div
      class="relative mt-3 flex h-5 overflow-hidden rounded bg-empty"
      role="img"
      :aria-label="segments.filter((s) => seats(s) > 0).map((s) => `${s.party}: ${s.holdover} not up, ${s.called} called, ${s.leading} leading`).join('; ')"
    >
      <div :style="{ width: pct(left.holdover), background: left.color, opacity: 0.55 }" />
      <div :style="{ width: pct(left.called), background: left.color }" />
      <div :style="{ width: pct(left.leading), background: left.color, opacity: 0.3 }" />
      <div class="flex flex-1 justify-center">
        <template v-for="s in others" :key="s.party">
          <div :style="{ width: `${(seats(s) / Math.max(1, props.chamber.totalSeats - seats(left) - seats(right))) * 100}%`, background: s.color, opacity: 0.55 }" />
        </template>
      </div>
      <div :style="{ width: pct(right.leading), background: right.color, opacity: 0.3 }" />
      <div :style="{ width: pct(right.called), background: right.color }" />
      <div :style="{ width: pct(right.holdover), background: right.color, opacity: 0.55 }" />
      <div v-if="showMajority" class="absolute inset-y-0 left-1/2 w-px bg-ink" :title="`${majority} seats for a majority`" />
    </div>
    <div class="text-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span>Solid = called by civicAPI</span>
      <span>Medium = seats not on the ballot</span>
      <span>Light = currently leading (not a call)</span>
    </div>
  </div>
</template>
