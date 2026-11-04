<script setup lang="ts">
import type { RaceDetail, RegionResult } from '#shared/types'
import { POLL_CLOSINGS } from '#shared/utils/pollClosings'
import { runoffDate } from '#shared/utils/rules'
import { certificationOf } from '#shared/utils/certification'
import { formatShift, shiftVs2024, turnoutEstimate, type Baseline } from '#shared/utils/baseline'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, dataAge, isOld, archived } = useLive<RaceDetail>(() => `/api/race/${id.value}`, () => `race-${id.value}`)

const inf = computed(() =>
  data.value && !data.value.testData
    ? inferRace(data.value.candidates, data.value.pct, data.value.projectionRegions ?? data.value.regions, rules.value!)
    : null,
)
const rules = computed(() => (data.value ? rulesFor(data.value.state, data.value.kind) : null))
const stateFips = computed(() => (data.value ? STATE_BY_POSTAL.get(data.value.state)?.fips : undefined))
const showCountyMap = computed(() => Boolean(stateFips.value && data.value?.regions.length && data.value.kind !== 'house'))

// 2024 county baseline for the turnout model and the shift column (statewide races only).
const baseline = shallowRef<Baseline | null>(null)
onMounted(async () => {
  try {
    baseline.value = await loadGeo<Baseline>('/data/county-2024.json')
  } catch {
    // The page works without it.
  }
})
const statewide = computed(() => data.value?.kind !== 'house')
const turnout = computed(() =>
  baseline.value && statewide.value && data.value && stateFips.value && !data.value.testData
    ? turnoutEstimate(data.value.candidates, data.value.projectionRegions ?? data.value.regions, baseline.value, stateFips.value)
    : null,
)
/** In runoff and RCV states a leader under 50% is never shown as out of reach. */
const belowMajority = computed(() => Boolean(rules.value && (rules.value.majority || rules.value.rcv) && inf.value && inf.value.leaderShare < 0.5))
const shiftOf = (r: RegionResult) => (baseline.value && statewide.value ? shiftVs2024(r, baseline.value) : null)
const hasShift = computed(() => (data.value?.regions ?? []).some((r) => shiftOf(r) !== null))
const mapMode = ref<'leader' | 'shift'>('leader')

const regionRows = computed(() =>
  (data.value?.regions ?? [])
    .map((r) => ({ region: r, inf: inferRace(r.candidates, r.pct), shift: shiftOf(r) }))
    .sort((a, b) => b.inf.counted - a.inf.counted || a.region.name.localeCompare(b.region.name)),
)
const showAllRegions = ref(false)

// civicAPI's polls_close is wrong for several states; use the reviewed table.
const pollsClose = computed(() => {
  const t = data.value ? POLL_CLOSINGS[data.value.state] : undefined
  if (!t) return null
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  return t.first === t.last ? `${fmt(t.first)} ET` : `${fmt(t.first)}–${fmt(t.last)} ET`
})

const formatDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const runoff = computed(() => (data.value ? runoffDate(data.value.state, data.value.kind) : null))
const certified = computed(() => (data.value ? certificationOf(data.value.state) : null))

const kindLabel = computed(() => ({ senate: 'US Senate', governor: 'Governor', house: 'US House' })[data.value?.kind ?? 'senate'])
const backView = computed(() => (data.value?.kind === 'senate' ? undefined : data.value?.kind))

useHead({ title: () => (data.value ? `${data.value.name} — Election Night` : 'Race — Election Night') })
</script>

<template>
  <div>
    <NuxtLink
      :to="{ path: '/', query: { view: backView, state: data?.state } }"
      class="kicker inline-flex items-center gap-1 hover:!text-ink"
    >
      ← All {{ kindLabel }} races
    </NuxtLink>

    <div v-if="error && !data" class="mt-6 rounded border border-rule bg-panel p-6">
      <p class="font-semibold">This race is not available.</p>
      <p class="text-muted mt-1 text-sm">{{ error.statusMessage ?? 'civicAPI did not respond.' }}</p>
    </div>

    <div v-else-if="data?.testData" role="status" class="mt-6 rounded border border-ink bg-panel p-6">
      <p class="font-semibold">civicAPI marks this race as TEST DATA.</p>
      <p class="text-muted mt-1 text-sm">The numbers are not real results, so they are hidden. This page refreshes every 30 seconds.</p>
    </div>

    <template v-else-if="data && inf">
      <header class="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
        <div>
          <div class="kicker">{{ data.delegate ? 'US House delegate (non-voting)' : kindLabel }} · {{ stateName(data.state) }}</div>
          <h1 class="font-display mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{{ data.name }}</h1>
        </div>
        <div class="flex items-center gap-2 text-xs">
          <span v-if="!isOld && !archived" class="live-dot" />
          <span v-if="archived" class="num text-muted">Final snapshot · {{ formatSnapshot(data.dataAsOf) }}</span>
          <span v-else class="num" :class="isOld ? 'font-semibold text-ink' : 'text-muted'">Data from {{ formatAge(dataAge) }}</span>
        </div>
      </header>

      <div v-if="data.stale" role="status" class="mt-4 rounded border border-ink bg-panel px-4 py-3 text-sm">
        <template v-if="data.pctFrozen">civicAPI is slow or not responding. These counts are from the state's own results, so reporting % and estimates are not shown.</template>
        <template v-else>civicAPI is slow or not responding. These results are from {{ formatAge(dataAge) }} and may be out of date.</template>
      </div>
      <div v-if="certified" role="status" class="mt-4 rounded border border-rule bg-panel px-4 py-3 text-sm">
        {{ stateName(data.state) }} certified its results on {{ formatDay(certified.date) }}.
        <a :href="certified.source" class="underline underline-offset-2" target="_blank" rel="noopener">Official source</a>
      </div>
      <div v-else-if="inf?.status === 'called'" class="text-muted mt-4 text-xs">
        Results are unofficial until {{ stateName(data.state) }} certifies them.
      </div>
      <div v-if="runoff && inf?.status === 'runoff'" role="status" class="mt-4 rounded border border-ink bg-panel px-4 py-3 text-sm">
        No candidate has 50% yet. If that holds, the top two meet in a runoff on {{ formatDay(runoff) }}.
      </div>
      <div v-if="data.disputed" role="status" class="mt-4 rounded border border-ink bg-panel px-4 py-3 text-sm">
        civicAPI marks this result as disputed.
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section class="rounded-lg border border-rule bg-panel p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="num text-sm">
              <span class="font-semibold">{{ formatPct(data) }}</span> <span class="text-muted">reporting ·</span>
              <span class="font-semibold">{{ formatNumber(inf.counted) }}</span> <span class="text-muted">votes</span>
              <template v-if="pollsClose"><span class="text-muted"> · polls close {{ pollsClose }}</span></template>
            </div>
            <span class="flex flex-wrap items-center gap-1">
              <FlipTag :race="data" />
              <StatusTag :status="inf.status" :color="inf.leader?.color" />
            </span>
          </div>
          <CandidateRows class="mt-5" :candidates="data.candidates" :limit="12" />

          <div v-if="showCountyMap" class="mt-8">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-display text-lg font-semibold tracking-tight">By county</h2>
              <div v-if="hasShift" class="flex rounded border border-rule text-xs" role="group" aria-label="Map shading">
                <button
                  v-for="m in ([['leader', 'Leader'], ['shift', 'Shift vs 2024']] as const)"
                  :key="m[0]"
                  type="button"
                  class="px-2.5 py-1"
                  :class="mapMode === m[0] ? 'bg-ink text-paper' : 'text-muted hover:text-ink'"
                  :aria-pressed="mapMode === m[0]"
                  @click="mapMode = m[0]"
                >
                  {{ m[1] }}
                </button>
              </div>
            </div>
            <p v-if="mapMode === 'shift'" class="text-muted text-xs">
              Colour shows which way the Democratic-minus-Republican margin moved from the 2024 presidential race in that county. Darker = larger
              move (full at 20 points). Grey = no comparison. This compares different races and candidates; it is not a forecast.
            </p>
            <p v-else class="text-muted text-xs">
              Colour shows the county leader. Darker = wider county margin. Grey = no votes.<template v-if="data.regionSource === 'state'">
                County figures are from the {{ data.crossCheck?.source }}. A county's % is its share of precincts fully reported.</template
              ><template v-else-if="data.crossCheck?.used"> County figures are from civicAPI.</template>
            </p>
            <CountyMap class="mt-3" :state-fips="stateFips!" :regions="data.regions" :mode="mapMode" :shift-of="shiftOf" />
          </div>
        </section>

        <aside class="space-y-6">
          <CrossCheckPanel v-if="data.crossCheck" :check="data.crossCheck" />
          <VoteTypesPanel v-if="data.voteTypes" :split="data.voteTypes" />
          <section class="rounded-lg border border-rule bg-panel p-5">
            <h2 class="font-display text-lg font-semibold tracking-tight">What the count says</h2>
            <p v-if="inf.status === 'no-votes'" class="text-muted mt-2 text-sm">No votes are reported yet.</p>
            <template v-else>
              <dl class="mt-3 space-y-3 text-sm">
                <div class="flex justify-between gap-4">
                  <dt class="text-muted">Current margin</dt>
                  <dd class="num font-semibold">{{ formatNumber(inf.marginVotes) }} ({{ formatShare(inf.marginShare) }})</dd>
                </div>
                <div v-if="inf.estRemaining !== null" class="flex justify-between gap-4">
                  <dt class="text-muted">Est. votes left to count</dt>
                  <dd class="num font-semibold">{{ formatNumber(inf.estRemaining) }}</dd>
                </div>
                <div v-if="inf.estTotal !== null" class="flex justify-between gap-4">
                  <dt class="text-muted">Est. final turnout</dt>
                  <dd class="num font-semibold">{{ formatNumber(inf.estTotal) }}</dd>
                </div>
                <div v-if="inf.runnerUp && inf.neededShare !== null && inf.status !== 'called'" class="border-t border-rule pt-3">
                  <dt class="text-muted">To overtake, {{ inf.runnerUp.name }} needs</dt>
                  <dd class="num mt-1 text-2xl font-semibold">
                    <template v-if="inf.neededShare > 1">More votes than remain</template>
                    <template v-else>{{ formatShare(inf.neededShare) }}</template>
                  </dd>
                  <dd class="text-muted mt-1 text-xs">of the remaining votes between the top two candidates.</dd>
                </div>
              </dl>

              <div v-if="turnout && inf.status !== 'called'" class="mt-5 border-t border-rule pt-4">
                <h3 class="kicker">Second estimate: 2024 turnout</h3>
                <dl class="mt-2 space-y-2 text-sm">
                  <div class="flex justify-between gap-4">
                    <dt class="text-muted">Est. votes left to count</dt>
                    <dd class="num font-semibold">{{ formatNumber(turnout.estRemaining) }}</dd>
                  </div>
                  <div v-if="inf.runnerUp && turnout.neededShare !== null && !belowMajority" class="flex justify-between gap-4">
                    <dt class="text-muted">{{ inf.runnerUp.name }} would need</dt>
                    <dd class="num font-semibold">
                      <template v-if="turnout.estRemaining === 0">–</template>
                      <template v-else>{{ turnout.neededShare > 1 ? 'More than remains' : formatShare(turnout.neededShare) }}</template>
                    </dd>
                  </div>
                </dl>
                <p class="text-muted mt-2 text-xs">
                  Each county is expected to cast its 2024 presidential vote × {{ formatShare(turnout.ratio, 0) }}, the turnout seen in the
                  {{ turnout.completeCounties }} counties that have finished counting. Counties that finish first are often small, so this can
                  be off. It does not change the status above.
                </p>
              </div>

              <div v-if="inf.estRemaining" class="mt-5 border-t border-rule pt-4">
                <h3 class="kicker">If the rest votes like what is counted</h3>
                <p class="text-muted mt-1 text-xs">
                  Each county's uncounted vote is split like its counted vote. Votes from counties with nothing reported are split like
                  the statewide count.
                </p>
                <ul class="mt-3 space-y-1.5 text-sm">
                  <li v-for="p in inf.projected.slice(0, 4)" :key="p.name" class="flex justify-between gap-3">
                    <span class="flex min-w-0 items-center gap-1.5">
                      <span class="inline-block size-2 shrink-0 rounded-full" :style="{ background: p.color }" />
                      <span class="truncate">{{ p.name }}</span>
                    </span>
                    <span class="num">{{ formatShare(p.share) }}</span>
                  </li>
                </ul>
                <p v-if="inf.projectionFlips" class="mt-3 rounded border border-rule bg-paper p-2 text-xs">
                  The projection puts {{ inf.projected[0]!.name }} ahead. The uncounted vote is in areas that favour a different candidate
                  than the current leader. The status above uses the statewide count only.
                </p>
              </div>
            </template>
            <p class="text-muted mt-5 border-t border-rule pt-3 text-xs">
              These are arithmetic estimates from reported counts, not race calls. Mail, early and Election Day ballots are often counted
              at different times and can lean differently, so early leads can move in either direction.
            </p>
          </section>

          <section v-if="regionRows.length" class="rounded-lg border border-rule bg-panel p-5">
            <h2 class="font-display text-lg font-semibold tracking-tight">Areas</h2>
            <table class="mt-3 w-full text-sm">
              <thead>
                <tr class="kicker border-b border-rule text-left">
                  <th class="py-1.5 font-normal">Area</th>
                  <th class="py-1.5 font-normal">Leader</th>
                  <th class="py-1.5 text-right font-normal">Margin</th>
                  <th v-if="hasShift" class="py-1.5 text-right font-normal" title="Margin change from the 2024 presidential race">vs 2024</th>
                  <th class="py-1.5 text-right font-normal">Rep.</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="{ region, inf: r, shift } in showAllRegions ? regionRows : regionRows.slice(0, 15)"
                  :key="region.key"
                  class="border-b border-rule/60 last:border-0"
                >
                  <td class="py-1.5 pr-2">{{ region.name }}</td>
                  <td class="py-1.5 pr-2">
                    <span v-if="r.leader && r.counted" class="inline-block size-2 rounded-full" :style="{ background: r.leader.color }" :title="r.leader.name" />
                    <span v-if="r.leader && r.counted" class="ml-1.5 text-xs">{{ r.leader.name.split(' ').at(-1) }}</span>
                    <span v-else class="text-muted">–</span>
                  </td>
                  <td class="num py-1.5 text-right">{{ r.counted ? formatShare(r.marginShare, 0) : '–' }}</td>
                  <td v-if="hasShift" class="num py-1.5 text-right">{{ shift === null ? '–' : formatShift(shift) }}</td>
                  <td class="num py-1.5 text-right">{{ Math.round(region.pct) }}%</td>
                </tr>
              </tbody>
            </table>
            <button
              v-if="regionRows.length > 15"
              class="kicker mt-3 rounded border border-rule px-3 py-1.5 hover:!text-ink"
              @click="showAllRegions = !showAllRegions"
            >
              {{ showAllRegions ? 'Show fewer' : `Show all ${regionRows.length}` }}
            </button>
          </section>
        </aside>
      </div>
    </template>

    <div v-else class="mt-10 text-muted">Loading…</div>
  </div>
</template>
