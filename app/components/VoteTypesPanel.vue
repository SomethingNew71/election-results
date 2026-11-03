<script setup lang="ts">
import type { VoteTypeBreakdown } from '#shared/types'

const props = defineProps<{ split: VoteTypeBreakdown }>()

const now = useClock()
const typeTotals = computed(() => props.split.types.map((_, i) => props.split.votes.reduce((n, row) => n + (row[i] ?? 0), 0)))
const total = computed(() => typeTotals.value.reduce((n, v) => n + v, 0))
// Types with no votes yet (provisional, post-election) are listed, not shown as empty columns.
const shown = computed(() => props.split.types.map((name, i) => ({ name, i })).filter((t) => typeTotals.value[t.i]! > 0))
const empty = computed(() => props.split.types.filter((_, i) => typeTotals.value[i] === 0))
const rows = computed(() =>
  props.split.candidates
    .map((name, r) => ({ name, votes: props.split.votes[r]!, sum: props.split.votes[r]!.reduce((n, v) => n + v, 0) }))
    .sort((a, b) => b.sum - a.sum),
)
</script>

<template>
  <section class="rounded-lg border border-rule bg-panel p-5">
    <h2 class="font-display text-lg font-semibold tracking-tight">Votes by type</h2>
    <p class="text-muted mt-1 text-xs">
      <a :href="split.sourceUrl" class="underline underline-offset-2 hover:text-ink" target="_blank" rel="noopener">{{ split.source }}</a>
      <template v-if="split.checkedAt"> · checked {{ formatAge(ageOf(split.checkedAt, now)) }}</template>
    </p>

    <p v-if="total === 0" class="text-muted mt-3 text-sm">No votes are reported by type yet.</p>
    <template v-else>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="kicker border-b border-rule text-left">
              <th class="py-1.5 pr-2 font-normal">Candidate</th>
              <th v-for="t in shown" :key="t.i" class="py-1.5 pl-2 text-right font-normal">{{ t.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.name" class="border-b border-rule/60 last:border-0">
              <td class="py-1.5 pr-2">{{ r.name }}</td>
              <td v-for="t in shown" :key="t.i" class="num py-1.5 pl-2 text-right">
                {{ formatShare(r.votes[t.i]! / typeTotals[t.i]!) }}
                <span class="text-muted block text-xs">{{ formatNumber(r.votes[t.i]!) }}</span>
              </td>
            </tr>
            <tr class="kicker">
              <td class="pt-2 pr-2">Share of counted</td>
              <td v-for="t in shown" :key="t.i" class="num pt-2 pl-2 text-right">
                {{ formatShare(typeTotals[t.i]! / total) }}
                <span class="text-muted block text-xs normal-case">{{ formatNumber(typeTotals[t.i]!) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="empty.length" class="text-muted mt-2 text-xs">No votes yet: {{ empty.join(', ') }}.</p>
    </template>
    <p class="text-muted mt-3 text-xs">
      Vote types use the state's own labels. States count some types before others, so the lead can move as each type is added. This
      split is fetched separately: it can be up to a minute behind the count above, and the state's types may not include every
      ballot.
    </p>
  </section>
</template>
