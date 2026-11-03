<script setup lang="ts">
import type { Overview, RaceKind, RaceSummary } from '#shared/types'
import type { StateFill } from '~/components/UsMap.vue'

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

const { data, error, secondsAgo, status } = useLive<Overview>('/api/overview', 'overview')

/** Only the 50 states and DC appear on the map and in the seat count. */
const races = computed(() =>
  (data.value?.races ?? []).filter((r) => r.kind === kind.value && STATE_BY_POSTAL.has(r.state)),
)
const otherRaces = computed(() =>
  (data.value?.races ?? []).filter((r) => r.kind === kind.value && !STATE_BY_POSTAL.has(r.state)),
)
const chamber = computed(() => data.value?.chambers.find((c) => c.kind === kind.value))

const inferred = computed(() => races.value.map((race) => ({ race, inf: inferRace(race.candidates, race.pct) })))

const fills = computed<Record<string, StateFill>>(() => {
  const byState = new Map<string, typeof inferred.value>()
  for (const item of inferred.value) {
    if (!byState.has(item.race.state)) byState.set(item.race.state, [])
    byState.get(item.race.state)!.push(item)
  }
  const out: Record<string, StateFill> = {}
  for (const [state, items] of byState) {
    if (kind.value === 'house') {
      // Colour by the party leading the most districts; strength = share of seats it leads.
      const tally = new Map<string, { color: string; n: number }>()
      for (const { inf } of items) {
        if (!inf.leader || inf.status === 'no-votes') continue
        const t = tally.get(inf.leader.party) ?? { color: inf.leader.color, n: 0 }
        t.n++
        tally.set(inf.leader.party, t)
      }
      const top = [...tally.entries()].sort((a, b) => b[1].n - a[1].n)[0]
      out[state] = top
        ? {
            color: top[1].color,
            opacity: 0.2 + 0.8 * (top[1].n / items.length),
            pending: false,
            title: `${stateName(state)}: ${top[0]} leads ${top[1].n} of ${items.length} seats`,
          }
        : { color: '', opacity: 0, pending: true, title: `${stateName(state)}: no votes yet` }
      continue
    }
    // States with two races (rare) use the stronger result.
    const best = items.sort((a, b) => STATUS_OPACITY[b.inf.status] - STATUS_OPACITY[a.inf.status])[0]!
    const pending = best.inf.status === 'no-votes'
    out[state] = {
      color: best.inf.leader?.color ?? '',
      opacity: STATUS_OPACITY[best.inf.status],
      pending,
      title: pending
        ? `${stateName(state)}: no votes yet`
        : `${stateName(state)}: ${best.inf.leader!.name} — ${STATUS_LABEL[best.inf.status]}, ${best.race.pct}% reporting`,
    }
  }
  return out
})

const selectedRaces = computed(() =>
  selected.value
    ? inferred.value
        .filter((i) => i.race.state === selected.value)
        .sort((a, b) => (a.race.district ?? '').localeCompare(b.race.district ?? '', 'en', { numeric: true }))
    : [],
)

const filter = ref('')
const STATUS_RANK: Record<string, number> = {
  competitive: 0, lean: 1, strong: 2, early: 3, decided: 4, called: 5, 'no-votes': 6,
}
const table = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return inferred.value
    .filter(({ race }) => !q || `${race.name} ${stateName(race.state)} ${race.district ?? ''}`.toLowerCase().includes(q) ||
      race.candidates.some((c) => c.name.toLowerCase().includes(q)))
    .sort((a, b) =>
      STATUS_RANK[a.inf.status]! - STATUS_RANK[b.inf.status]! ||
      (a.inf.neededShare ?? 9) - (b.inf.neededShare ?? 9) ||
      a.race.name.localeCompare(b.race.name, 'en', { numeric: true }))
})
const showAll = ref(false)
const totalReporting = computed(() => races.value.filter((r) => totalVotes(r.candidates) > 0).length)

function label(r: RaceSummary) {
  return r.district ?? stateName(r.state)
}

useHead({ title: () => `${KINDS.find((k) => k.kind === kind.value)!.label} results — Election Night` })
</script>

<template>
  <div>
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
      <div class="ml-auto flex items-center gap-2 self-center text-xs">
        <span class="live-dot" />
        <span class="num text-muted">
          <template v-if="status === 'pending' && !data">Loading…</template>
          <template v-else>Updated {{ secondsAgo }}s ago</template>
        </span>
      </div>
    </nav>

    <div v-if="error && !data" class="mt-8 rounded border border-rule bg-panel p-6">
      <p class="font-semibold">Results are not available right now.</p>
      <p class="text-muted mt-1 text-sm">civicAPI did not respond. The page retries every 30 seconds.</p>
    </div>

    <template v-else>
      <section v-if="chamber" class="mt-6 rounded-lg border border-rule bg-panel p-5">
        <BalanceBar :chamber="chamber" :races="races" :party-colors="data?.partyColors ?? {}" />
      </section>

      <section class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="rounded-lg border border-rule bg-panel p-3 sm:p-5">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-display text-xl font-semibold tracking-tight">
              {{ races.length }} {{ kind === 'house' ? 'districts' : 'races' }}
            </h2>
            <span class="kicker">{{ totalReporting }} with votes reported</span>
          </div>
          <UsMap class="mt-3" :fills="fills" :selected="selected" @select="(s) => setQuery({ state: s })" />
          <div class="text-muted mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span class="flex items-center gap-1.5">
              <svg width="14" height="14"><rect width="14" height="14" fill="url(#pending-hatch)" /></svg>
              No votes yet
            </span>
            <span class="flex items-center gap-1.5">
              <span class="inline-block size-3.5 rounded-sm bg-empty" />
              No race
            </span>
            <span v-if="kind !== 'house'">Darker shade = larger lead relative to the votes left to count</span>
            <span v-else>Shade = share of the state's seats the leading party is ahead in</span>
          </div>
        </div>

        <aside class="rounded-lg border border-rule bg-panel p-5">
          <template v-if="selected && selectedRaces.length">
            <div class="flex items-start justify-between gap-2">
              <h2 class="font-display text-2xl font-semibold tracking-tight">{{ stateName(selected) }}</h2>
              <button class="kicker hover:!text-ink" @click="setQuery({ state: null })">Close</button>
            </div>
            <div class="mt-4 max-h-[36rem] space-y-6 overflow-y-auto pr-1">
              <article v-for="{ race, inf } in selectedRaces" :key="race.id">
                <div class="flex items-center justify-between gap-2">
                  <NuxtLink :to="`/race/${race.id}`" class="font-semibold underline-offset-4 hover:underline">
                    {{ kind === 'house' ? race.district : race.name }}
                  </NuxtLink>
                  <StatusTag :status="inf.status" :color="inf.leader?.color" />
                </div>
                <div class="kicker mt-1">{{ race.pct }}% reporting · {{ formatNumber(inf.counted) }} votes</div>
                <CandidateRows class="mt-3" :candidates="race.candidates" :limit="3" compact />
              </article>
            </div>
          </template>
          <template v-else>
            <h2 class="font-display text-xl font-semibold tracking-tight">Select a state</h2>
            <p class="text-muted mt-2 text-sm">
              Click a state on the map to see its {{ kind === 'house' ? 'districts' : 'race' }}. Each race page has a county map and the
              full vote-count inference.
            </p>
            <dl class="mt-5 space-y-3 text-sm">
              <div v-for="s in (['competitive', 'lean', 'strong', 'decided', 'called'] as const)" :key="s">
                <dt><StatusTag :status="s" /></dt>
                <dd class="text-muted mt-1">{{ STATUS_HELP[s] }}</dd>
              </div>
            </dl>
          </template>
        </aside>
      </section>

      <section class="mt-6 rounded-lg border border-rule bg-panel p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-xl font-semibold tracking-tight">All races, closest first</h2>
          <input
            v-model="filter"
            type="search"
            placeholder="Filter by state, district or candidate"
            class="w-full rounded border border-rule bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink sm:w-72"
          />
        </div>
        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[40rem] text-sm">
            <thead>
              <tr class="kicker border-b border-rule text-left">
                <th class="py-2 pr-3 font-normal">Race</th>
                <th class="py-2 pr-3 font-normal">Leader</th>
                <th class="py-2 pr-3 text-right font-normal">Margin</th>
                <th class="py-2 pr-3 text-right font-normal">Reporting</th>
                <th class="py-2 pr-3 text-right font-normal" title="Share of the remaining two-way vote the trailing candidate needs">Needs</th>
                <th class="py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="{ race, inf } in showAll ? table : table.slice(0, 25)"
                :key="race.id"
                class="border-b border-rule/60 last:border-0"
              >
                <td class="py-2 pr-3">
                  <NuxtLink :to="`/race/${race.id}`" class="font-medium underline-offset-4 hover:underline">{{ label(race) }}</NuxtLink>
                </td>
                <td class="py-2 pr-3">
                  <span v-if="inf.leader && inf.counted" class="flex items-center gap-1.5">
                    <span class="inline-block size-2 shrink-0 rounded-full" :style="{ background: inf.leader.color }" />
                    <span class="truncate">{{ inf.leader.name }}</span>
                  </span>
                  <span v-else class="text-muted">–</span>
                </td>
                <td class="num py-2 pr-3 text-right">{{ inf.counted ? formatShare(inf.marginShare) : '–' }}</td>
                <td class="num py-2 pr-3 text-right">{{ race.pct }}%</td>
                <td class="num py-2 pr-3 text-right">
                  {{ inf.neededShare !== null && inf.neededShare <= 1 && inf.status !== 'called' ? formatShare(inf.neededShare, 0) : '–' }}
                </td>
                <td class="py-2"><StatusTag :status="inf.status" :color="inf.leader?.color" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button
          v-if="table.length > 25"
          class="kicker mt-3 rounded border border-rule px-3 py-1.5 hover:!text-ink"
          @click="showAll = !showAll"
        >
          {{ showAll ? 'Show fewer' : `Show all ${table.length}` }}
        </button>
      </section>

      <section v-if="otherRaces.length" class="mt-6 rounded-lg border border-rule bg-panel p-5">
        <h2 class="font-display text-lg font-semibold tracking-tight">Territories</h2>
        <ul class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <li v-for="race in otherRaces" :key="race.id">
            <NuxtLink :to="`/race/${race.id}`" class="font-medium underline-offset-4 hover:underline">{{ race.name }}</NuxtLink>
            <CandidateRows class="mt-2" :candidates="race.candidates" :limit="2" compact />
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
