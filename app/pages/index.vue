<script setup lang="ts">
import type { Overview, RaceKind, RaceSummary } from '#shared/types'
import type { StateFill } from '~/components/UsMap.vue'
import { POLL_CLOSINGS, pollsHaveClosed } from '#shared/utils/pollClosings'
import { CHANGE_MARK_MS } from '~/composables/useRaceChanges'

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
/** House only: one square per district instead of state shapes. */
const layout = computed(() => (kind.value === 'house' && route.query.layout === 'districts' ? 'districts' : 'states'))

function setQuery(patch: Record<string, string | null>) {
  const query = { ...route.query, ...patch }
  for (const k of Object.keys(query)) if (query[k] === null) delete query[k]
  router.replace({ query })
}

const { data, error, dataAge, isOld, status, archived } = useLive<Overview>('/api/overview', 'overview')
const showHolders = useShowOfficeholders()
const holderTable = computed(() =>
  kind.value === 'senate' ? SENATE_NOT_UP : kind.value === 'governor' ? GOVERNOR_NOT_UP : null,
)

/** Only the 50 states and DC appear on the map and in the seat count; delegates never do. */
const onMap = (r: RaceSummary) => STATE_BY_POSTAL.has(r.state) && !r.delegate
const races = computed(() => (data.value?.races ?? []).filter((r) => r.kind === kind.value && onMap(r)))
const otherRaces = computed(() =>
  (data.value?.races ?? [])
    .filter((r) => r.kind === kind.value && !onMap(r))
    .sort((a, b) => a.name.localeCompare(b.name)),
)
const chamber = computed(() => data.value?.chambers.find((c) => c.kind === kind.value))

const inferred = computed(() =>
  races.value.map((race) => ({
    race,
    inf: inferRace(race.candidates, race.pct, undefined, rulesFor(race.state, race.kind)),
  })),
)

/** Every race on the ballot, for the change log (it covers all three tabs). */
const allInferred = computed(() =>
  (data.value?.races ?? []).map((race) => ({
    race,
    inf: inferRace(race.candidates, race.pct, undefined, rulesFor(race.state, race.kind)),
  })),
)
const { events, changedAt } = useRaceChanges(allInferred)
const now = useClock()
const isChanged = (id: number) => now.value - (changedAt.value[id] ?? 0) < CHANGE_MARK_MS

/** Oldest state-feed check among races that use one. */
const feedAge = computed(() => {
  const checks = (data.value?.races ?? []).map((r) => r.crossCheck?.checkedAt).filter((t): t is string => Boolean(t))
  return checks.length ? ageOf(checks.sort()[0], now.value) : null
})

function closingNote(state: string) {
  const t = POLL_CLOSINGS[state]
  if (!t || pollsHaveClosed(state, now.value)) return 'no votes yet'
  const time = new Date(t.first).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  return `polls close ${time} ET`
}

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
            mode: 'result',
            color: top[1].color,
            opacity: 0.2 + 0.8 * (top[1].n / items.length),
            title: `${stateName(state)}: ${top[0]} leads ${top[1].n} of ${items.length} seats`,
          }
        : { mode: 'pending', title: `${stateName(state)}: ${closingNote(state)}` }
      continue
    }
    // States with two races (rare) use the stronger result.
    const best = [...items].sort((a, b) => STATUS_OPACITY[b.inf.status] - STATUS_OPACITY[a.inf.status])[0]!
    out[state] =
      best.inf.status === 'no-votes'
        ? { mode: 'pending', title: `${stateName(state)}: ${closingNote(state)}` }
        : {
            mode: 'result',
            color: best.inf.leader!.color,
            opacity: STATUS_OPACITY[best.inf.status],
            title: `${stateName(state)}: ${best.inf.leader!.name} — ${STATUS_LABEL[best.inf.status]}, ${formatPct(best.race)} reporting`,
          }
  }
  if (showHolders.value && holderTable.value) {
    for (const [state, parties] of Object.entries(holderTable.value)) {
      if (out[state]) continue
      out[state] = {
        mode: 'holder',
        colors: [...new Set(parties.map(partyColor))],
        title: `${stateName(state)}: no race. Current ${kind.value === 'senate' ? 'senators' : 'governor'}: ${parties.join(', ')}`,
      }
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
const table = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return inferred.value
    .filter(({ race }) => !q || `${race.name} ${stateName(race.state)} ${race.district ?? ''}`.toLowerCase().includes(q) ||
      race.candidates.some((c) => c.name.toLowerCase().includes(q)))
    .sort((a, b) =>
      STATUS_RANK[a.inf.status] - STATUS_RANK[b.inf.status] ||
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
        @click="setQuery({ view: k.kind === 'senate' ? null : k.kind, state: null, layout: null })"
      >
        {{ k.label }}
      </button>
      <div class="ml-auto flex items-center gap-2 self-center text-xs">
        <span v-if="!isOld && !archived" class="live-dot" />
        <span class="num" :class="isOld ? 'font-semibold text-ink' : 'text-muted'">
          <template v-if="archived">Final snapshot · {{ formatSnapshot(data?.dataAsOf) }}</template>
          <template v-else-if="status === 'pending' && !data">Loading…</template>
          <template v-else>Data from {{ formatAge(dataAge) }}</template>
          <template v-if="feedAge !== null && !archived"> · state feeds checked {{ formatAge(feedAge) }}</template>
        </span>
      </div>
    </nav>

    <div v-if="data?.stale" role="status" class="mt-4 rounded border border-ink bg-panel px-4 py-3 text-sm">
      civicAPI is not responding. These results are from {{ formatAge(dataAge) }} and may be out of date.
    </div>

    <div v-if="error && !data" class="mt-8 rounded border border-rule bg-panel p-6">
      <p class="font-semibold">Results are not available right now.</p>
      <p class="text-muted mt-1 text-sm">civicAPI did not respond. The page retries every 30 seconds.</p>
    </div>

    <template v-else>
      <ClientOnly v-if="!archived"><NextClosings class="mt-4" /></ClientOnly>

      <section v-if="chamber" class="mt-6 rounded-lg border border-rule bg-panel p-5">
        <BalanceBar :chamber="chamber" :races="races" />
      </section>

      <section class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="rounded-lg border border-rule bg-panel p-3 sm:p-5">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="font-display text-xl font-semibold tracking-tight">
              {{ races.length }} {{ kind === 'house' ? 'districts' : 'races' }}
            </h2>
            <span class="kicker">{{ totalReporting }} with votes reported</span>
          </div>
          <div v-if="kind === 'house'" class="mt-3 flex w-fit rounded border border-rule text-xs" role="group" aria-label="Map layout">
            <button
              v-for="m in ([['states', 'States'], ['districts', 'Districts']] as const)"
              :key="m[0]"
              type="button"
              class="px-2.5 py-1"
              :class="layout === m[0] ? 'bg-ink text-paper' : 'text-muted hover:text-ink'"
              :aria-pressed="layout === m[0]"
              @click="setQuery({ layout: m[0] === 'districts' ? 'districts' : null })"
            >
              {{ m[1] }}
            </button>
          </div>
          <DistrictGrid v-if="layout === 'districts'" class="mt-3" :items="inferred" />
          <UsMap v-else class="mt-3" :fills="fills" :selected="selected" @select="(s) => setQuery({ state: s })" />
          <label
            class="mt-3 flex w-fit items-center gap-2 text-sm"
            :class="holderTable ? 'cursor-pointer' : 'text-muted cursor-not-allowed'"
            :title="holderTable ? '' : 'Every House seat is on the ballot'"
          >
            <input v-model="showHolders" type="checkbox" class="size-4 accent-[var(--ink)]" :disabled="!holderTable" />
            Shade states with no race by current officeholders' party
          </label>
          <div class="text-muted mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <span class="flex items-center gap-1.5">
              <svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" fill="url(#pending-dots)" /></svg>
              No votes yet
            </span>
            <span v-if="showHolders && holderTable" class="flex items-center gap-1.5">
              <svg width="14" height="14" aria-hidden="true">
                <rect width="14" height="14" fill="var(--empty)" />
                <path d="M0 14 L14 0 M-4 6 L6 -4 M8 18 L18 8" :stroke="partyColor(LEFT_PARTY)" stroke-width="3" stroke-opacity="0.55" />
              </svg>
              Striped = no race, shaded by current officeholders (not a result)
            </span>
            <span v-else class="flex items-center gap-1.5">
              <span class="inline-block size-3.5 rounded-sm bg-empty" />
              No race
            </span>
            <span v-if="kind !== 'house' || layout === 'districts'">Darker shade = larger lead relative to the votes left to count</span>
            <span v-else>Shade = share of the state's seats the leading party is ahead in</span>
            <span v-if="layout === 'districts'">One square per district; outlined = called by civicAPI. Squares show seats, not district shapes.</span>
          </div>
        </div>

        <div class="space-y-6">
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
                <div class="kicker mt-1">{{ formatPct(race) }} reporting · {{ formatNumber(inf.counted) }} votes</div>
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
              <div v-for="s in (['competitive', 'lean', 'strong', 'decided', 'close', 'runoff', 'rcv', 'called'] as const)" :key="s">
                <dt><StatusTag :status="s" /></dt>
                <dd class="text-muted mt-1">{{ STATUS_HELP[s] }}</dd>
              </div>
            </dl>
          </template>
        </aside>
        <RecentChanges v-if="!archived" :events="events" />
        </div>
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
                class="border-b border-rule/60 transition-colors last:border-0"
                :class="isChanged(race.id) ? 'bg-paper' : ''"
              >
                <td class="py-2 pr-3">
                  <NuxtLink :to="`/race/${race.id}`" class="font-medium underline-offset-4 hover:underline">{{ label(race) }}</NuxtLink>
                  <span v-if="isChanged(race.id)" class="kicker ml-2 rounded border border-ink px-1 !text-ink">Changed</span>
                </td>
                <td class="py-2 pr-3">
                  <span v-if="inf.leader && inf.counted" class="flex items-center gap-1.5">
                    <span class="inline-block size-2 shrink-0 rounded-full" :style="{ background: inf.leader.color }" />
                    <span class="truncate">{{ inf.leader.name }}</span>
                  </span>
                  <span v-else class="text-muted">–</span>
                </td>
                <td class="num py-2 pr-3 text-right">{{ inf.counted ? formatShare(inf.marginShare) : '–' }}</td>
                <td class="num py-2 pr-3 text-right">
                  {{ formatPct(race) }}
                  <span
                    v-if="race.crossCheck"
                    class="kicker ml-1 rounded border border-rule px-1"
                    :title="race.crossCheck.used ? `Counts from ${race.crossCheck.source}` : `Cross-checked against ${race.crossCheck.source}`"
                  >{{ race.crossCheck.used ? 'State' : '✓' }}</span>
                </td>
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
        <h2 class="font-display text-lg font-semibold tracking-tight">
          {{ kind === 'house' ? 'DC and territory delegates' : 'Territories' }}
        </h2>
        <p v-if="kind === 'house'" class="mt-1 text-sm text-muted">Non-voting members. Not on the map or in the 435-seat count.</p>
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
