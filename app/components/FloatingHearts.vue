<script setup lang="ts">
// A tiny flourish: spawn a heart that floats up the screen and fades when the user
// (un)votes. 'vote' → a red heart; 'unvote' → a grayscale broken heart.
//
// Rendered in a fixed, teleported-to-<body> overlay so it sits above everything and
// is never clipped by a card's rounded `overflow-hidden` (the old in-card version got
// trapped behind the cards above it). Each heart is positioned at the click's screen
// coords and removes itself on animationend so the list never grows unbounded.
type HeartKind = 'vote' | 'unvote'
interface Heart { id: number, kind: HeartKind, x: number, y: number, drift: number }

const hearts = ref<Heart[]>([])
let seq = 0

/** Spawn a heart at viewport coords (x, y) — the center of the tapped vote button. */
function spawn(kind: HeartKind, x: number, y: number): void {
  // A little horizontal drift so repeated taps don't stack in a single column.
  const drift = Math.round((Math.random() - 0.5) * 48)
  hearts.value = [...hearts.value, { id: seq++, kind, x, y, drift }]
}

function remove(id: number): void {
  hearts.value = hearts.value.filter(h => h.id !== id)
}

defineExpose({ spawn })
</script>

<template>
  <Teleport to="body">
    <div class="floating-hearts pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      <UIcon
        v-for="h in hearts"
        :key="h.id"
        :name="h.kind === 'vote' ? 'i-lucide-heart' : 'i-lucide-heart-crack'"
        :class="[
          'floating-heart fixed size-7 drop-shadow',
          h.kind === 'vote' ? 'text-red-500' : 'text-neutral-400 grayscale'
        ]"
        :style="{ 'left': `${h.x}px`, 'top': `${h.y}px`, '--drift': `${h.drift}px` }"
        @animationend="remove(h.id)"
      />
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes floating-heart {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.4);
  }
  12% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.1);
  }
  /* Rise about half the viewport, fading out over the back half of the trip. */
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--drift)), calc(-50% - 48vh)) scale(1.25);
  }
}

.floating-heart {
  animation: floating-heart 1.8s cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
  will-change: transform, opacity;
}

/* Respect users who prefer no motion — show nothing rather than a jump. */
@media (prefers-reduced-motion: reduce) {
  .floating-heart {
    animation: none;
    opacity: 0;
  }
}
</style>
