<script setup lang="ts">
import type { Candidate } from '#shared/types'

const props = withDefaults(defineProps<{ candidates: Candidate[]; limit?: number; compact?: boolean }>(), {
  limit: 6,
  compact: false,
})

const total = computed(() => totalVotes(props.candidates))
const rows = computed(() => sortByVotes(props.candidates).slice(0, props.limit))
</script>

<template>
  <ul class="space-y-2">
    <li v-for="c in rows" :key="c.name">
      <div class="flex items-baseline justify-between gap-3" :class="compact ? 'text-sm' : ''">
        <span class="flex min-w-0 items-center gap-2">
          <span class="inline-block size-2.5 shrink-0 rounded-full" :style="{ background: c.color }" />
          <span class="truncate font-medium">{{ c.name }}</span>
          <span v-if="c.winner" class="kicker rounded border border-ink px-1 !text-ink">Winner</span>
          <span v-if="c.incumbent" class="kicker">Inc.</span>
        </span>
        <span class="num shrink-0 text-right">
          <span class="font-semibold">{{ total ? formatShare(c.votes / total) : '–' }}</span>
          <span v-if="!compact" class="text-muted ml-3 inline-block min-w-[6rem]">{{ formatNumber(c.votes) }}</span>
        </span>
      </div>
      <div class="kicker mt-0.5 truncate" :class="compact ? 'hidden' : ''">{{ c.party }}</div>
      <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-empty">
        <div
          class="h-full rounded-full transition-[width] duration-700"
          :style="{ width: total ? `${(c.votes / total) * 100}%` : '0%', background: c.color }"
        />
      </div>
    </li>
  </ul>
</template>
