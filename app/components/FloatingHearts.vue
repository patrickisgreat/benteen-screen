<script setup lang="ts">
// A tiny flourish: spawn a heart that floats up and fades when the user (un)votes.
// 'vote' → a red heart rising; 'unvote' → a grayscale broken heart. Self-cleaning:
// each heart removes itself on animationend so the list never grows unbounded.
type HeartKind = 'vote' | 'unvote'
interface Heart { id: number, kind: HeartKind, drift: number }

const hearts = ref<Heart[]>([])
let seq = 0

function spawn(kind: HeartKind): void {
  // A little horizontal drift so repeated taps don't stack in a single column.
  const drift = Math.round((Math.random() - 0.5) * 22)
  hearts.value = [...hearts.value, { id: seq++, kind, drift }]
}

function remove(id: number): void {
  hearts.value = hearts.value.filter(h => h.id !== id)
}

defineExpose({ spawn })
</script>

<template>
  <div class="floating-hearts pointer-events-none absolute inset-0 overflow-visible">
    <UIcon
      v-for="h in hearts"
      :key="h.id"
      :name="h.kind === 'vote' ? 'i-lucide-heart' : 'i-lucide-heart-crack'"
      :class="[
        'floating-heart absolute left-1/2 top-1/2 size-5',
        h.kind === 'vote' ? 'text-red-500' : 'text-neutral-400 grayscale'
      ]"
      :style="{ '--drift': `${h.drift}px` }"
      @animationend="remove(h.id)"
    />
  </div>
</template>

<style scoped>
@keyframes floating-heart {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.4);
  }
  25% {
    opacity: 1;
    transform: translate(calc(-50% + var(--drift) * 0.4), -120%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--drift)), -260%) scale(1.15);
  }
}

.floating-heart {
  animation: floating-heart 0.9s ease-out forwards;
}

/* Respect users who prefer no motion — show nothing rather than a jump. */
@media (prefers-reduced-motion: reduce) {
  .floating-heart {
    animation: none;
    opacity: 0;
  }
}
</style>
