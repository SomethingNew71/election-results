<script setup lang="ts">
import { flipOf, type FlipRace } from '#shared/utils/flip'

const props = defineProps<{ race: FlipRace }>()
const flip = computed(() => flipOf(props.race))
</script>

<template>
  <span
    v-if="flip"
    class="kicker inline-flex items-center rounded-full border border-ink px-2 py-0.5 whitespace-nowrap !text-ink"
    :title="`Flip: civicAPI has called this race for the ${flip.to} candidate. The ${flip.from} party held this seat going into the election.`"
  >
    Flip {{ flip.from[0] }} → {{ flip.to[0] }}
  </span>
</template>
