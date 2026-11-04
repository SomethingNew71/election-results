<script setup lang="ts">
import type { ForecastData, ForecastRace, RaceKind } from '#shared/types'
import type { StateFill } from '~/components/UsMap.vue'
import { CHAMBER_SEATS, ratingRank, ratingStyle } from '#shared/utils/forecast'
import { partyColor } from '#shared/utils/parties'
import { formatSnapshot } from '~/composables/useLive'
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

// The forecast changes a few times a day at most; no live polling. Lazy, so a slow civicAPI shows "Loading…" instead of blocking navigation.
const { data, error, status } = useFetch<ForecastData>('/api/forecast', { key: 'forecast', lazy: true })

const chamber = computed(() => data.value?.chambers.find((c) => c.kind === kind.value) ?? null)
const chamberMissing = computed(() => Boolean(data.value?.missing.includes(kind.value)))
const unit = computed(() => (kind.value === 'governor' ? 'governorships' : 'seats'))
const D = partyColor('Democratic')
const R = partyColor('Republican')

/** Shown big: Democratic and Republican seats by rating, as civicAPI's site does. */
const simOk = computed(() => !chamber.value?.simulationIssues.length)
const totalsSum = computed(() => {
  const t = chamber.value?.totals
  return t ? t.dem + t.rep + t.ind + t.tossup + t.unrated : 0
})
const sumOf = (t: { dem: number; rep: number; tossup: number; ind: number }) => t.dem + t.rep + t.tossup + t.ind

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
    const ind = (r.ind ?? 0) >= 1 ? ` · I ${formatNum(r.ind)}%` : ''
    out[r.state] = { mode: 'result', color: s.color, opacity: s.opacity, title: `${stateName(r.state)}: ${r.rating} · D ${formatNum(r.dem)}% · R ${formatNum(r.rep)}%${ind} (forecast)` }
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
function gap(r: { dem: number | null; rep: number | null; ind: number | null }) {
  const [x = 0, y = 0] = [r.dem ?? 0, r.rep ?? 0, r.ind ?? 0].sort((p, q) => q - p)
  return x - y
}
const weightSum = computed(() => Math.round(Object.values(chamber.value?.weights ?? {}).reduce((n, w) => n + w, 0) * 100))
const showInd = computed(() => (chamber.value?.races ?? []).some((r) => (r.ind ?? 0) >= 1))
const LIMIT = 60
const showAll = ref(false)
watch([kind, selected, query], () => (showAll.value = false))

const maxBin = computed(() => Math.max(0.0001, ...(chamber.value?.distribution ?? []).map((b) => b.probability)))

function formatNum(n: number | null) {
  if (n === null) return '–'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
function pct(n: number | null) {
  return n === null ? '–' : `${formatNum(n)}%`
}
const CHANCE_OF: Record<string, 'dem' | 'rep' | 'ind'> = { Democratic: 'dem', Republican: 'rep', Independent: 'ind' }
/** Named candidates, plus a note for a party civicAPI gives a chance without naming anyone. */
function shownCandidates(r: ForecastRace) {
  return r.candidates.filter((c) => c.name || (r[CHANCE_OF[c.party]!] ?? 0) >= 0.1)
}
const national = computed(() => data.value?.chambers.find((c) => c.kind === 'house')?.national ?? null)
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

useHead({ title: () => `civicAPI ${KINDS.find((k) => k.kind === kind.value)!.label} forecast — Election Night` })
</script>

<template>
  <div>
    <ModeSwitch />
    <nav class="flex gap-1 border-b border-rule" aria-label="Chamber">
      <button
        v-for="k in KINDS"
        :key="k.kind"
        class="font-display -mb-px border-b-2 px-4 py-2 text-lg font-semibold tracking-tight transition-colors"
        :class="kind === k.kind ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'"
        @click="setQuery({ view: k.kind === 'senate' ? null : k.kind, state: null })"
      >
        {{ k.label }}
      </button>
      <span v-if="data" class="text-muted num ml-auto hidden self-center text-xs sm:inline">Fetched {{ formatSnapshot(data.dataAsOf) }}</span>
    </nav>

    <div role="note" class="mt-4 rounded-lg border-2 border-dashed border-rule bg-panel px-4 py-3 text-sm">
      <p class="font-semibold">This page is a forecast, not results.</p>
      <p class="text-muted mt-1">
        It shows <a href="https://civicapi.org/forecasts" class="underline underline-offset-2 hover:text-ink" target="_blank" rel="noopener">civicAPI's
        2026 forecast</a> as published: a blend of expert ratings, betting markets, polls and money raised. It is not our estimate, and
        nothing on the results pages uses it. Betting markets react to counts as they come in, so on election night it can partly
        reflect results.
      </p>
    </div>

    <div v-if="data?.stale" role="status" class="mt-4 rounded border border-ink bg-panel px-4 py-3 text-sm">
      civicAPI is slow or not responding. This forecast is an older copy.
    </div>
    <div v-if="error && !data" class="mt-8 rounded border border-rule bg-panel p-6">
      <p class="font-semibold">The forecast is not available right now.</p>
      <p class="text-muted mt-1 text-sm">civicAPI did not respond. Reload the page to try again.</p>
    </div>
    <p v-else-if="status === 'pending' && !data" class="text-muted mt-8 text-sm">Loading…</p>
    <p v-else-if="chamberMissing" class="mt-8 rounded border border-rule bg-panel p-6 text-sm">civicAPI did not answer for this chamber. The other tabs may still work.</p>

    <template v-else-if="chamber">
      <section class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="rounded-lg border border-rule bg-panel p-5">
          <div class="kicker">{{ unit === 'seats' ? 'Seats' : 'Governorships' }} by civicAPI rating · {{ chamber.majorityThreshold }} for a majority</div>
          <div class="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <span class="num font-display text-4xl font-bold" :style="{ color: D }">{{ chamber.totals.dem }}</span>
              <span class="text-muted ml-1 text-sm">Democratic</span>
            </div>
            <div>
              <span class="num font-display text-4xl font-bold">{{ chamber.totals.tossup }}</span>
              <span class="text-muted ml-1 text-sm">Toss-up</span>
            </div>
            <div>
              <span class="num font-display text-4xl font-bold" :style="{ color: R }">{{ chamber.totals.rep }}</span>
              <span class="text-muted ml-1 text-sm">Republican</span>
            </div>
            <div v-if="chamber.totals.ind">
              <span class="num font-display text-4xl font-bold">{{ chamber.totals.ind }}</span>
              <span class="text-muted ml-1 text-sm">Independent</span>
            </div>
          </div>
          <p class="text-muted mt-2 text-xs">
            Races counted by civicAPI's rating<template v-if="chamber.totals.notUp.dem + chamber.totals.notUp.rep + chamber.totals.notUp.ind">, plus {{ unit }} not on the ballot
            (D {{ chamber.totals.notUp.dem }}<template v-if="chamber.totals.notUp.ind"> · I {{ chamber.totals.notUp.ind }}</template> · R {{ chamber.totals.notUp.rep }})</template>.
            <template v-if="chamber.totals.unrated">{{ chamber.totals.unrated }} unrated. </template>
            <template v-if="totalsSum !== CHAMBER_SEATS[chamber.kind]">These add up to {{ totalsSum }} of {{ CHAMBER_SEATS[chamber.kind] }}. </template>
            <template v-if="chamber.publishedTotals">
              civicAPI's API publishes D {{ chamber.publishedTotals.dem }} · Toss-up {{ chamber.publishedTotals.tossup }} · R {{ chamber.publishedTotals.rep }}
              ({{ sumOf(chamber.publishedTotals) }} in total); these figures follow civicAPI's site instead.
            </template>
          </p>

          <template v-if="simOk">
            <div class="kicker mt-5">civicAPI's chance of a majority</div>
            <div class="mt-1 flex flex-wrap items-baseline gap-x-8 gap-y-1">
              <div v-if="chamber.probDem !== null">
                <span class="num font-display text-2xl font-bold" :style="{ color: D }">{{ formatNum(chamber.probDem) }}%</span>
                <span class="text-muted ml-1 text-sm">Democratic</span>
              </div>
              <div v-if="chamber.probRep !== null">
                <span class="num font-display text-2xl font-bold" :style="{ color: R }">{{ formatNum(chamber.probRep) }}%</span>
                <span class="text-muted ml-1 text-sm">Republican</span>
              </div>
            </div>
            <dl v-if="chamber.seats" class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt class="text-muted">Democratic {{ unit }} (median, 90% range)</dt>
                <dd class="num font-semibold">{{ chamber.seats.dem[1] }} <span class="text-muted font-normal">({{ chamber.seats.dem[0] }}–{{ chamber.seats.dem[2] }})</span></dd>
              </div>
              <div>
                <dt class="text-muted">Republican {{ unit }} (median, 90% range)</dt>
                <dd class="num font-semibold">{{ chamber.seats.rep[1] }} <span class="text-muted font-normal">({{ chamber.seats.rep[0] }}–{{ chamber.seats.rep[2] }})</span></dd>
              </div>
            </dl>
          </template>
          <div v-else role="note" class="mt-4 rounded border border-rule bg-paper p-3 text-sm">
            <p class="font-semibold">civicAPI's simulation for this chamber does not add up today, so it is not shown.</p>
            <ul class="text-muted mt-1 list-disc pl-5">
              <li v-for="p in chamber.simulationIssues" :key="p">{{ p }}</li>
            </ul>
            <p class="text-muted mt-1">The race ratings and win chances below are not affected.</p>
          </div>
          <p class="text-muted mt-2 text-xs">
            <template v-if="simOk && chamber.seats?.simulations">From {{ chamber.seats.simulations.toLocaleString('en-US') }} simulations run by civicAPI. </template>
            <template v-if="simOk && chamber.chamberRating">civicAPI rates the chamber {{ chamber.chamberRating }}. </template>
            <template v-if="chamber.updated">Forecast of {{ chamber.updated }}; fetched {{ formatSnapshot(data!.dataAsOf) }}.</template>
          </p>

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
            <div class="relative mt-5">
              <UsMap :fills="fills" :selected="selected" @select="(s) => setQuery({ state: selected === s ? null : s })" />
              <span class="kicker pointer-events-none absolute top-0 left-0 rounded border border-dashed border-rule bg-panel/80 px-2 py-1">civicAPI forecast · not results</span>
            </div>
            <p class="text-muted mt-2 text-xs">Colour shows the forecast rating. Darker = safer. Grey = toss-up. Blank = no race. Select a state to filter the table.</p>
          </template>

          <div v-if="simOk && chamber.distribution.length" class="mt-5">
            <div class="kicker">Simulated Democratic {{ unit }}</div>
            <div class="mt-2 flex h-28 items-end gap-px" role="img" aria-label="Distribution of simulated seat counts">
              <div
                v-for="b in chamber.distribution"
                :key="b.seats"
                class="flex-1 rounded-t-sm bg-muted/60"
                :title="`${b.seats} ${unit}: ${formatNum(b.probability)}% of simulations`"
                :style="{ height: `${(b.probability / maxBin) * 100}%`, minHeight: b.probability > 0 ? '2px' : '0' }"
              />
            </div>
            <div class="num text-muted mt-1 flex justify-between text-xs">
              <span>{{ chamber.distribution[0]!.seats }}</span>
              <span>{{ chamber.distribution.at(-1)!.seats }}</span>
            </div>
          </div>

          <div v-if="kind === 'house' && national" class="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div v-if="national.popularVote" class="rounded border border-rule bg-paper p-3">
              <div class="kicker">civicAPI popular-vote estimate</div>
              <p class="num mt-1 font-semibold"><span :style="{ color: D }">D {{ national.popularVote.dem }}%</span> · <span :style="{ color: R }">R {{ national.popularVote.rep }}%</span></p>
              <p class="text-muted text-xs">
                <template v-if="national.popularVote.margin !== null">Margin {{ formatNum(national.popularVote.margin) }} points · </template>{{ national.popularVote.districts }} districts ·
                {{ national.popularVote.sources.join(', ') }}
              </p>
            </div>
            <div v-if="national.seatShare" class="rounded border border-rule bg-paper p-3">
              <div class="kicker">civicAPI seat-share estimate</div>
              <p class="num mt-1 font-semibold"><span :style="{ color: D }">D {{ national.seatShare.dem }}%</span> · <span :style="{ color: R }">R {{ national.seatShare.rep }}%</span></p>
            </div>
            <div v-if="national.genericBallot" class="rounded border border-rule bg-paper p-3">
              <div class="kicker">Generic ballot polling</div>
              <p class="num mt-1 font-semibold"><span :style="{ color: D }">D {{ national.genericBallot.dem }}%</span> · <span :style="{ color: R }">R {{ national.genericBallot.rep }}%</span></p>
              <p class="text-muted text-xs">
                {{ national.genericBallot.polls }} polls<template v-if="national.genericBallot.confidence !== null"> · civicAPI confidence {{ formatNum(national.genericBallot.confidence) }}</template>
              </p>
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
                    <template v-for="(c, i) in shownCandidates(r)" :key="c.party"
                      >{{ i ? ' · ' : '' }}<span :style="{ color: partyColor(c.party) }">●</span>
                      <template v-if="c.name">{{ c.name }}</template><em v-else>no {{ c.party }} candidate named</em></template
                    >
                  </span>
                </td>
                <td class="py-1.5 pr-2 whitespace-nowrap">
                  <span class="inline-block size-2.5 rounded-sm" :style="{ backgroundColor: ratingStyle(r.rating).color, opacity: ratingStyle(r.rating).opacity + 0.15 }" />
                  {{ r.rating }}
                </td>
                <td class="num py-1.5 pl-2 text-right">{{ pct(r.dem) }}</td>
                <td class="num py-1.5 pl-2 text-right">{{ pct(r.rep) }}</td>
                <td v-if="showInd" class="num py-1.5 pl-2 text-right">{{ r.ind ? pct(r.ind) : '–' }}</td>
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
