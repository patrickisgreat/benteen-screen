<script setup lang="ts">
import { POSTER_RATIO_LABELS } from '#shared/utils/posterDisplay'
import type { PosterDisplay, PosterRatio } from '#shared/utils/posterDisplay'

defineProps<{ posterUrl: string }>()
const model = defineModel<PosterDisplay>({ required: true })

const previewRef = ref<HTMLElement | null>(null)
const dragging = ref(false)
let startX = 0
let startY = 0
let startPosX = 50
let startPosY = 50

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)))
}

function onPointerDown(e: PointerEvent): void {
  dragging.value = true
  startX = e.clientX
  startY = e.clientY
  startPosX = model.value.posX
  startPosY = model.value.posY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging.value || !previewRef.value) return
  const rect = previewRef.value.getBoundingClientRect()
  // Drag the image like a map: moving it right reveals the left side, so the
  // focal point moves the opposite way.
  const dx = ((e.clientX - startX) / rect.width) * 100
  const dy = ((e.clientY - startY) / rect.height) * 100
  model.value = { ...model.value, posX: clampPct(startPosX - dx), posY: clampPct(startPosY - dy) }
}

function onPointerUp(e: PointerEvent): void {
  dragging.value = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
}

function setRatio(ratio: PosterRatio): void {
  model.value = { ...model.value, ratio }
}

function onZoomInput(e: Event): void {
  model.value = { ...model.value, zoom: Number((e.target as HTMLInputElement).value) }
}

function reset(): void {
  model.value = { ...DEFAULT_POSTER_DISPLAY }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Ratio presets -->
    <div class="flex flex-wrap gap-1.5">
      <UButton
        v-for="r in POSTER_RATIOS"
        :key="r"
        :label="POSTER_RATIO_LABELS[r]"
        size="xs"
        :color="model.ratio === r ? 'primary' : 'neutral'"
        :variant="model.ratio === r ? 'solid' : 'outline'"
        @click="setRatio(r)"
      />
    </div>

    <!-- Live preview (drag to reposition) — same render path as the real header -->
    <div
      ref="previewRef"
      class="relative w-full overflow-hidden rounded-lg bg-black ring ring-default cursor-move touch-none select-none"
      :style="posterRatioStyle(model.ratio)"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <img :src="posterUrl" alt="" class="absolute inset-0 size-full object-cover scale-110 blur-2xl opacity-50 pointer-events-none">
      <img :src="posterUrl" alt="" class="absolute inset-0 size-full object-contain pointer-events-none" :style="posterFillStyle(model)">
      <div class="absolute inset-0 ring-1 ring-inset ring-white/15 pointer-events-none" />
      <span class="absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80 pointer-events-none">
        Drag to reposition
      </span>
    </div>

    <!-- Zoom -->
    <div class="flex items-center gap-3">
      <UIcon name="i-lucide-zoom-in" class="size-4 text-muted shrink-0" />
      <input
        type="range"
        :min="ZOOM_MIN"
        :max="ZOOM_MAX"
        step="0.05"
        :value="model.zoom"
        aria-label="Poster zoom"
        class="w-full accent-primary"
        @input="onZoomInput"
      >
      <span class="text-xs text-muted tabular-nums w-10 text-right shrink-0">{{ Math.round(model.zoom * 100) }}%</span>
    </div>

    <UButton label="Reset" icon="i-lucide-rotate-ccw" size="xs" color="neutral" variant="ghost" @click="reset" />
  </div>
</template>
