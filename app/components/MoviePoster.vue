<script setup lang="ts">
/**
 * A TMDB movie poster with a consistent fallback. `variant` picks the box size
 * (`sm` = list thumb, `lg` = card), `size` picks the TMDB image resolution.
 * With `fallback` off, nothing renders when the movie has no poster (matching
 * the card surfaces that don't want a placeholder box).
 */
const props = withDefaults(defineProps<{
  path: string | null | undefined
  alt: string
  size?: 'w185' | 'w500'
  variant?: 'sm' | 'lg'
  fallback?: boolean
}>(), { size: 'w500', variant: 'sm', fallback: true })

const { posterUrl } = useTmdb()
const src = computed(() => posterUrl(props.path, props.size))
const boxClass = computed(() => (props.variant === 'lg' ? 'h-32 w-22 rounded-md' : 'h-16 w-11 rounded'))
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="alt"
    class="object-cover bg-elevated shrink-0"
    :class="boxClass"
  >
  <span
    v-else-if="fallback"
    class="bg-elevated shrink-0 flex items-center justify-center"
    :class="boxClass"
  >
    <UIcon name="i-lucide-film" class="text-muted" />
  </span>
</template>
