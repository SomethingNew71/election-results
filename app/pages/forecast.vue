<script setup lang="ts">
import type { ForecastData, RaceKind } from '#shared/types'
import type { StateFill } from '~/components/UsMap.vue'
import { CHAMBER_SEATS, ratingRank, ratingStyle } from '#shared/utils/forecast'
import { partyColor } from '#shared/utils/parties'
import { stateName } from '#shared/utils/states'

const route = useRoute()
const router = useRouter()

const KINDS: { kind: RaceKind; label: string }[] = [
  { kind: 'senate', label: 'Senate' },
  { kind: 'house', label: 'House' },
  { kind: 'governor', label: 'Governor' },
]
const kind = computed<RaceKind>(() => {
  const k = route.query.view
  return k === 'house' || k === 'governor' ? k : 'senate'
})
const selected = computed(() => (typeof route.query.state === 'string' ? route.query.state : null))
function setQuery(patch: Record<string, string | null>) {
  const query = { ...route.query, ...patch }
  for (const k of Object.keys(query)) if (query[k] === null) delete query[k]
  router.replace({ query })
}

// The forecast changes a few times a day at most; no live polling.
const { data, error, status } = await useFetch<ForecastData>('/api/forecast', { key: 'forecast' })

const chamber = computed(() => data.value?.chambers.find((c) => c.kind === kind.value) ?? null)
const unit = computed(() => (kind.value === 'governor' ? 'governorships' : 'seats'))
const D = partyColor('Democratic')
const R = partyColor('Republican')

/** Published figures that cannot all be true; shown next to them, not corrected. */
const problems = computed(() => {
  const c = chamber.value
  if (!c) return []
  const out: string[] = []
  const seats = CHAMBER_SEATS[c.kind]
  const sum = c.totals.dem + c.totals.rep + c.totals.tossup + c.totals.ind
  if (sum !== seats) out.push(`The totals add up to ${sum}; there are ${seats}.`)
  if (c.probDem !== null && c.probRep !== null && c.probDem + c.probRep > 100.5) {
    out.push(`The two majority chances add up to ${formatNum(c.probDem + c.probRep)}%, which is more than 100%.`)
  }
  if (c.seats && c.seats.expectedDem + c.seats.expectedRep > seats + 0.5) {
    out.push(`The expected ${unit.value} add up to ${formatNum(c.seats.expectedDem + c.seats.expectedRep)}; there are ${seats}.`)
  }
  return out
})

const ratingCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const r of chamber.value?.races ?? []) counts.set(r.rating, (counts.get(r.rating) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => ratingRank(a[0]) - ratingRank(b[0]))
})

const fills = computed<Record<string, StateFill>>(() => {
  const out: Record<string, StateFill> = {}
  if (!chamber.value || kind.value === 'house') return out
  for (const r of chamber.value.races) {
    const s = ratingStyle(r.rating)
    out[r.state] = { mode: 'result', color: s.color, opacity: s.opacity, title: `${stateName(r.state)}: ${r.rating} · D ${formatNum(r.dem)}% · R ${formatNum(r.rep)}%` }
  }
  return out
})

const query = ref('')
const races = computed(() => {
  const q = query.value.trim().toLowerCase()
  return [...(chamber.value?.races ?? [])]
    .filter((r) => !selected.value || r.state === selected.value)
    .filter((r) => !q || r.key.toLowerCase().includes(q) || stateName(r.state).toLowerCase().includes(q) || r.candidates.some((c) => c.name.toLowerCase().includes(q)))
    .sort((a, b) => gap(a) - gap(b) || a.key.localeCompare(b.key))
})
/** Gap between the two highest win chances, so a race with a strong independent sorts by its real contest. */
function gap(r: { dem: number; rep: number; ind: number }) {
  const [x = 0, y = 0] = [r.dem, r.rep, r.ind].sort((p, q) => q - p)
  return x - y
}
const weightSum = computed(() => Math.round(Object.values(chamber.value?.weights ?? {}).reduce((n, w) => n + w, 0) * 100))
const showInd = computed(() => (chamber.value?.races ?? []).some((r) => r.ind >= 1))
const LIMIT = 60
const showAll = ref(false)
watch([kind, selected, query], () => (showAll.value = false))

const maxBin = computed(() => Math.max(0.0001, ...(chamber.value?.distribution ?? []).map((b) => b.probability)))

function formatNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
function label(key: string) {
  return key.length === 2 ? stateName(key) : key
}
const SOURCE_LABEL: Record<string, string> = {
  expert_ratings: 'Expert ratings',
  betting_markets: 'Betting markets',
  fundraising: 'Fundraising',
  polls: 'Polls',
  outside_spending: 'Outside spending',
}

useHead({ title: () => `${KINDS.find((k) => k.kind === kind.value)!.label} forecast — Election Night` })
</script>

<template>
  <div>
    <div role="note" class="rounded-lg border-2 border-dashed border-rule bg-panel px-4 py-3 text-sm">
      <p class="font-semibold">This page is a forecast, not results.</p>
      <p class="text-muted mt-1">
        It shows <a href="https://civicapi.org/forecasts" class="underline underline-offset-2 hover:text-ink" target="_blank" rel="noopener">civicAPI's
        2026 forecast</a> as published: a blend of expert ratings, betting markets, polls and money raised. It is not our estimate, and
        nothing on the results pages uses it. Betting markets react to counts as they come in, so on election night it can partly
        reflect results. <NuxtLink to="/" class="underline underline-offset-2 hover:text-ink">Back to results</NuxtLink>
      </p>
    </div>

    <nav class="mt-6 flex gap-1 border-b border-rule" aria-label="Chamber">
      <button
        v-for="k in KINDS"
        :key="k.kind"
        class="font-display -mb-px border-b-2 px-4 py-2 text-lg font-semibold tracking-tight transition-colors"
        :class="kind === k.kind ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'"
        @click="setQuery({ view: k.kind === 'senate' ? null : k.kind, state: null })"
      >
        {{ k.label }}
      </button>
      <span v-if="chamber" class="text-muted num ml-auto hidden self-center text-xs sm:inline">civicAPI forecast of {{ chamber.updated }}</span>
    </nav>

    <div v-if="data?.stale" role="status" class="mt-4 rounded border border-ink bg-panel px-4 py-3 text-sm">
      civicAPI is not responding. This forecast is an older copy.
    </div>
    <div v-if="error && !data" class="mt-8 rounded border border-rule bg-panel p-6">
      <p class="font-semibold">The forecast is not available right now.</p>
      <p class="text-muted mt-1 text-sm">civicAPI did not respond. Reload the page to try again.</p>
    </div>
    <p v-else-if="status === 'pending' && !data" class="text-muted mt-8 text-sm">Loading…</p>

    <template v-else-if="chamber">
      <section class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="rounded-lg border border-rule bg-panel p-5">
          <div class="kicker">Chance of a majority ({{ chamber.majorityThreshold }} {{ unit }})</div>
          <div class="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div v-if="chamber.probDem !== null">
              <span class="num font-display text-4xl font-bold" :style="{ color: D }">{{ formatNum(chamber.probDem) }}%</span>
              <span class="text-muted ml-1 text-sm">Democratic</span>
            </div>
            <div v-if="chamber.probRep !== null">
              <span class="num font-display text-4xl font-bold" :style="{ color: R }">{{ formatNum(chamber.probRep) }}%</span>
              <span class="text-muted ml-1 text-sm">Republican</span>
            </div>
          </div>

          <dl v-if="chamber.seats" class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-muted">Democratic {{ unit }} (median, 90% range)</dt>
              <dd class="num font-semibold">{{ chamber.seats.dem[1] }} <span class="text-muted font-normal">({{ chamber.seats.dem[0] }}–{{ chamber.seats.dem[2] }})</span></dd>
            </div>
            <div>
              <dt class="text-muted">Republican {{ unit }} (median, 90% range)</dt>
              <dd class="num font-semibold">{{ chamber.seats.rep[1] }} <span class="text-muted font-normal">({{ chamber.seats.rep[0] }}–{{ chamber.seats.rep[2] }})</span></dd>
            </div>
          </dl>
          <p class="text-muted mt-2 text-xs">
            <template v-if="chamber.seats">From {{ chamber.seats.simulations.toLocaleString('en-US') }} simulations run by civicAPI. </template>Forecast of
            {{ chamber.updated }}.
          </p>

          <div class="mt-5">
            <div class="kicker">Totals as published</div>
            <p class="num mt-1 text-sm">
              <span :style="{ color: D }" class="font-semibold">D {{ chamber.totals.dem }}</span> ·
              <span class="font-semibold">Toss-up {{ chamber.totals.tossup }}</span> ·
              <span :style="{ color: R }" class="font-semibold">R {{ chamber.totals.rep }}</span>
              <template v-if="chamber.totals.ind"> · <span class="font-semibold">I {{ chamber.totals.ind }}</span></template>
            </p>
          </div>

          <div v-if="problems.length" role="note" class="mt-4 rounded border border-rule bg-paper p-3 text-sm">
            <p class="font-semibold">These published figures do not add up.</p>
            <ul class="text-muted mt-1 list-disc pl-5">
              <li v-for="p in problems" :key="p">{{ p }}</li>
            </ul>
            <p class="text-muted mt-1">They are shown as civicAPI publishes them.</p>
          </div>

          <div class="mt-5">
            <div class="kicker">Races on the ballot by rating</div>
            <div class="mt-2 flex h-6 w-full overflow-hidden rounded border border-rule" role="img" :aria-label="ratingCounts.map(([r, n]) => `${r}: ${n}`).join(', ')">
              <div
                v-for="[rating, n] in ratingCounts"
                :key="rating"
                :title="`${rating}: ${n}`"
                :style="{ flexGrow: n, backgroundColor: ratingStyle(rating).color, opacity: ratingStyle(rating).opacity + 0.15 }"
              />
            </div>
            <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <li v-for="[rating, n] in ratingCounts" :key="rating" class="flex items-center gap-1.5">
                <span class="inline-block size-2.5 rounded-sm" :style="{ backgroundColor: ratingStyle(rating).color, opacity: ratingStyle(rating).opacity + 0.15 }" />
                {{ rating }} <span class="num text-muted">{{ n }}</span>
              </li>
            </ul>
          </div>

          <template v-if="kind !== 'house'">
            <UsMap class="mt-5" :fills="fills" :selected="selected" @select="(s) => setQuery({ state: selected === s ? null : s })" />
            <p class="text-muted mt-2 text-xs">Colour shows the forecast rating. Darker = safer. Grey = toss-up. Blank = no race. Select a state to filter the table.</p>
          </template>

          <div v-if="chamber.distribution.length" class="mt-5">
            <div class="kicker">Simulated Democratic {{ unit }}</div>
            <div class="mt-2 flex h-28 items-end gap-px" role="img" aria-label="Distribution of simulated seat counts">
              <div
                v-for="b in chamber.distribution"
                :key="b.seats"
                class="flex-1 rounded-t-sm"
                :title="`${b.seats} seats: ${formatNum(b.probability * 100)}% of simulations`"
                :style="{ height: `${(b.probability / maxBin) * 100}%`, minHeight: b.probability > 0 ? '2px' : '0', backgroundColor: b.control === 'democrat' ? D : b.control === 'republican' ? R : 'var(--color-muted, #8a8a8a)' }"
              />
            </div>
            <div class="num text-muted mt-1 flex justify-between text-xs">
              <span>{{ chamber.distribution[0]!.seats }}</span>
              <span>{{ chamber.distribution.at(-1)!.seats }}</span>
            </div>
          </div>

          <div v-if="kind === 'house' && data?.national" class="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div v-if="data.national.popularVote" class="rounded border border-rule bg-paper p-3">
              <div class="kicker">Projected popular vote</div>
              <p class="num mt-1 font-semibold"><span :style="{ color: D }">D {{ data.national.popularVote.dem }}%</span> · <span :style="{ color: R }">R {{ data.national.popularVote.rep }}%</span></p>
              <p class="text-muted text-xs">{{ data.national.popularVote.districts }} districts · {{ data.national.popularVote.sources.length }} sources</p>
            </div>
            <div v-if="data.national.seatShare" class="rounded border border-rule bg-paper p-3">
              <div class="kicker">Projected seat share</div>
              <p class="num mt-1 font-semibold"><span :style="{ color: D }">D {{ data.national.seatShare.dem }}%</span> · <span :style="{ color: R }">R {{ data.national.seatShare.rep }}%</span></p>
            </div>
            <div v-if="data.national.genericBallot" class="rounded border border-rule bg-paper p-3">
              <div class="kicker">Generic ballot polling</div>
              <p class="num mt-1 font-semibold"><span :style="{ color: D }">D {{ data.national.genericBallot.dem }}%</span> · <span :style="{ color: R }">R {{ data.national.genericBallot.rep }}%</span></p>
              <p class="text-muted text-xs">{{ data.national.genericBallot.polls }} polls</p>
            </div>
          </div>
        </div>

        <aside class="rounded-lg border border-rule bg-panel p-5">
          <h2 class="font-display text-lg font-semibold tracking-tight">How civicAPI builds it</h2>
          <p class="text-muted mt-1 text-xs">Weights of each input, as published.</p>
          <ul class="mt-3 space-y-2 text-sm">
            <li v-for="(w, k) in chamber.weights" :key="k">
              <div class="flex justify-between gap-2">
                <span>{{ SOURCE_LABEL[k] ?? k }}</span><span class="num">{{ Math.round(w * 100) }}%</span>
              </div>
              <p v-if="chamber.sources[k]?.length" class="text-muted text-xs">{{ chamber.sources[k]!.join(', ') }}</p>
            </li>
          </ul>
          <p v-if="weightSum !== 100" class="text-muted mt-3 text-xs">The published weights add up to {{ weightSum }}%, not 100%.</p>
          <p class="text-muted mt-3 text-xs">
            Win chances below are civicAPI's per-race figures. A chance is not a margin: 60% means the forecast expects that
            candidate to lose about 4 times in 10.
          </p>
        </aside>
      </section>

      <section class="mt-6 rounded-lg border border-rule bg-panel p-3 sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-xl font-semibold tracking-tight">
            {{ races.length }} {{ kind === 'house' ? 'districts' : 'races' }}<template v-if="selected"> in {{ stateName(selected) }}</template>
          </h2>
          <div class="flex items-center gap-2">
            <button v-if="selected" type="button" class="text-muted text-xs underline underline-offset-2 hover:text-ink" @click="setQuery({ state: null })">All states</button>
            <input v-model="query" type="search" placeholder="Search race or candidate" aria-label="Search races" class="rounded border border-rule bg-paper px-2 py-1 text-sm" />
          </div>
        </div>
        <p class="text-muted mt-1 text-xs">Closest forecasts first.</p>
        <div class="mt-3 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="kicker border-b border-rule text-left">
                <th class="py-1.5 pr-2 font-normal">Race</th>
                <th class="py-1.5 pr-2 font-normal">Rating</th>
                <th class="py-1.5 pl-2 text-right font-normal">D chance</th>
                <th class="py-1.5 pl-2 text-right font-normal">R chance</th>
                <th v-if="showInd" class="py-1.5 pl-2 text-right font-normal">I chance</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in showAll ? races : races.slice(0, LIMIT)" :key="r.key" class="border-b border-rule/60 align-top last:border-0">
                <td class="py-1.5 pr-2">
                  <NuxtLink v-if="r.raceId" :to="`/race/${r.raceId}`" class="font-semibold underline-offset-2 hover:underline">{{ label(r.key) }}</NuxtLink>
                  <span v-else class="font-semibold">{{ label(r.key) }}</span>
                  <span class="text-muted block text-xs">
                    <template v-for="(c, i) in r.candidates" :key="c.party">{{ i ? ' · ' : '' }}<span :style="{ color: partyColor(c.party) }">●</span> {{ c.name }}</template>
                  </span>
                </td>
                <td class="py-1.5 pr-2 whitespace-nowrap">
                  <span class="inline-block size-2.5 rounded-sm" :style="{ backgroundColor: ratingStyle(r.rating).color, opacity: ratingStyle(r.rating).opacity + 0.15 }" />
                  {{ r.rating }}
                </td>
                <td class="num py-1.5 pl-2 text-right">{{ formatNum(r.dem) }}%</td>
                <td class="num py-1.5 pl-2 text-right">{{ formatNum(r.rep) }}%</td>
                <td v-if="showInd" class="num py-1.5 pl-2 text-right">{{ r.ind ? `${formatNum(r.ind)}%` : '–' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button v-if="!showAll && races.length > LIMIT" type="button" class="kicker mt-3 rounded border border-rule px-3 py-1.5 hover:text-ink" @click="showAll = true">
          Show all {{ races.length }}
        </button>
      </section>
    </template>
  </div>
</template>
