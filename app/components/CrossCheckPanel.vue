<script setup lang="ts">
import type { CrossCheck } from '#shared/types'

const props = defineProps<{ check: CrossCheck }>()

const gap = computed(() => props.check.feedTotal - props.check.civicTotal)
const now = useClock()
const rows = computed(() => [...props.check.differences].sort((a, b) => Math.max(b.civic, b.feed) - Math.max(a.civic, a.feed)))
</script>

<template>
  <section class="rounded-lg border border-rule bg-panel p-5">
    <h2 class="font-display text-lg font-semibold tracking-tight">Official state count</h2>
    <p class="text-muted mt-1 text-xs">
      <a :href="check.sourceUrl" class="underline underline-offset-2 hover:text-ink" target="_blank" rel="noopener">{{ check.source }}</a>
      <template v-if="check.unitsTotal"> · {{ formatNumber(check.unitsReporting) }} of {{ formatNumber(check.unitsTotal) }} {{ check.unitLabel }} reporting</template><template v-if="check.version"> · version {{ check.version }}</template>
    </p>
    <p class="text-muted num mt-1 text-xs">
      State feed checked {{ formatAge(ageOf(check.checkedAt, now)) }} · this version downloaded {{ formatAge(ageOf(check.fetchedAt, now)) }}
    </p>

    <p class="mt-3 rounded border border-rule bg-paper p-2 text-sm">
      <template v-if="!check.matched">
        The state's candidate list does not match civicAPI's, so the counts above stay from civicAPI. The state figures are shown
        for comparison.
      </template>
      <template v-else-if="check.used">
        The state has counted {{ formatNumber(gap) }} more votes than civicAPI, so the counts above are the state's. Reporting % stays
        civicAPI's estimate, so the votes left may be overstated.
      </template>
      <template v-else-if="gap === 0 && check.feedTotal > 0">Both sources show the same total.</template>
      <template v-else-if="check.feedTotal === 0 && check.civicTotal === 0">Neither source has votes yet.</template>
      <template v-else>civicAPI has counted {{ formatNumber(-gap) }} more votes than the state feed, so civicAPI's counts are shown.</template>
    </p>

    <table class="mt-3 w-full text-sm">
      <thead>
        <tr class="kicker border-b border-rule text-left">
          <th class="py-1.5 font-normal">Candidate</th>
          <th class="py-1.5 text-right font-normal">civicAPI</th>
          <th class="py-1.5 text-right font-normal">State</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.name" class="border-b border-rule/60 last:border-0">
          <td class="py-1.5 pr-2">{{ r.name }}</td>
          <td class="num py-1.5 text-right">{{ formatNumber(r.civic) }}</td>
          <td class="num py-1.5 text-right" :class="r.feed !== r.civic ? 'font-semibold' : ''">{{ formatNumber(r.feed) }}</td>
        </tr>
        <tr class="kicker">
          <td class="pt-2">Total</td>
          <td class="num pt-2 text-right">{{ formatNumber(check.civicTotal) }}</td>
          <td class="num pt-2 text-right">{{ formatNumber(check.feedTotal) }}</td>
        </tr>
      </tbody>
    </table>
    <p class="text-muted mt-3 text-xs">
      Counts are never averaged. Both sources report the same official tally at different times; the more complete one is shown.
    </p>
  </section>
</template>
