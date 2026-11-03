<script setup lang="ts">
import type { InferenceStatus } from '#shared/utils/inference'

defineProps<{ status: InferenceStatus; color?: string }>()
</script>

<template>
  <span
    class="kicker inline-flex items-center gap-1.5 rounded-full border border-rule px-2 py-0.5 whitespace-nowrap !text-ink"
    :title="STATUS_HELP[status]"
  >
    <span
      class="inline-block size-2 rounded-full"
      :style="{ background: color ?? 'var(--muted)', opacity: Math.max(STATUS_OPACITY[status], 0.2) }"
    />
    {{ STATUS_LABEL[status] }}
  </span>
</template>
