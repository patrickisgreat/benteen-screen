<script setup lang="ts">
/** A row of headline stat tiles (icon + value + label) — the 4-up summary grid
 *  shared by the event and user stats modals. */
defineProps<{ tiles: ReadonlyArray<{ label: string, value: string | number, icon: string }> }>()
</script>

<template>
  <div class="grid grid-cols-4 gap-2 text-center">
    <div v-for="t in tiles" :key="t.label" class="rounded-lg ring ring-default p-2">
      <UIcon :name="t.icon" class="text-muted" />
      <p class="text-xl font-bold leading-tight">
        {{ t.value }}
      </p>
      <p class="text-[11px] text-muted leading-tight">
        {{ t.label }}
      </p>
    </div>
  </div>
</template>
