<script setup lang="ts">
import type { ChamberTotals, RaceSummary } from '#shared/types'

const props = defineProps<{
  chamber: ChamberTotals
  races: RaceSummary[]
  partyColors: Record<string, string>
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
    if (!map.has(party)) {
      map.set(party, { party, color: props.partyColors[party] ?? '#8a8a8a', holdover: 0, called: 0, leading: 0 })
    }
    return map.get(party)!
  }
  for (const [party, n] of Object.entries(props.chamber.holdovers)) seg(party).holdover += n
  for (const race of props.races) {
    const inf = inferRace(race.candidates, race.pct)
    if (!inf.leader || inf.status === 'no-votes') continue
    const s = seg(inf.leader.party)
    if (inf.status === 'called') s.called++
    else s.leading++
  }
  return [...map.values()]
    .filter((s) => s.holdover + s.called + s.leading > 0)
    .sort((a, b) => b.holdover + b.called + b.leading - (a.holdover + a.called + a.leading))
})

const accounted = computed(() => segments.value.reduce((n, s) => n + s.holdover + s.called + s.leading, 0))
const open = computed(() => Math.max(0, props.chamber.totalSeats - accounted.value))
const majority = computed(() => Math.floor(props.chamber.totalSeats / 2) + 1)
const pct = (n: number) => `${(n / props.chamber.totalSeats) * 100}%`
// Show the right half of the segments from the right edge so the bar reads from both ends.
const left = computed(() => segments.value.slice(0, 1))
const right = computed(() => segments.value.slice(1))
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div v-for="s in segments" :key="s.party" class="min-w-0">
        <div class="kicker truncate">{{ s.party }}</div>
        <div class="num text-2xl font-semibold" :style="{ color: s.color }">{{ s.holdover + s.called }}</div>
        <div class="num text-muted text-xs">
          <template v-if="s.holdover">{{ s.holdover }} not up · </template>{{ s.called }} called · {{ s.leading }} leading
        </div>
      </div>
      <div class="text-right">
        <div class="kicker">Undecided / no votes</div>
        <div class="num text-2xl font-semibold">{{ open + segments.reduce((n, s) => n + s.leading, 0) }}</div>
        <div class="num text-muted text-xs">{{ majority }} for a majority</div>
      </div>
    </div>
    <div class="relative mt-3 flex h-5 overflow-hidden rounded bg-empty">
      <template v-for="s in left" :key="s.party">
        <div :style="{ width: pct(s.holdover), background: s.color, opacity: 0.55 }" />
        <div :style="{ width: pct(s.called), background: s.color }" />
        <div :style="{ width: pct(s.leading), background: s.color, opacity: 0.3 }" />
      </template>
      <div class="flex-1" />
      <template v-for="s in [...right].reverse()" :key="s.party">
        <div :style="{ width: pct(s.leading), background: s.color, opacity: 0.3 }" />
        <div :style="{ width: pct(s.called), background: s.color }" />
        <div :style="{ width: pct(s.holdover), background: s.color, opacity: 0.55 }" />
      </template>
      <div class="absolute inset-y-0 left-1/2 w-px bg-ink" :title="`${majority} seats for a majority`" />
    </div>
    <div class="text-muted mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span>Solid = called by civicAPI</span>
      <span>Medium = seats not on the ballot</span>
      <span>Light = currently leading (not a call)</span>
    </div>
  </div>
</template>
