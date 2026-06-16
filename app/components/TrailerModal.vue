<script setup lang="ts">
import type { TmdbMovie } from '#shared/types/movie'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ movie: TmdbMovie | null }>()

const { getTrailer } = useTmdb()
const loading = ref(false)
const trailerKey = ref<string | null>(null)

watch(open, async (isOpen) => {
  if (!isOpen || !props.movie) return
  loading.value = true
  trailerKey.value = null
  try {
    const { key } = await getTrailer(props.movie.id)
    trailerKey.value = key
  } catch {
    trailerKey.value = null
  } finally {
    loading.value = false
  }
})

const embedUrl = computed(() =>
  trailerKey.value ? `https://www.youtube-nocookie.com/embed/${trailerKey.value}?autoplay=1&rel=0` : null
)
</script>

<template>
  <UModal
    v-model:open="open"
    :title="movie ? `${movie.title} — Trailer` : 'Trailer'"
    :ui="{ content: 'sm:max-w-4xl' }"
  >
    <template #body>
      <div class="aspect-video w-full rounded-lg overflow-hidden bg-black flex items-center justify-center">
        <UIcon v-if="loading" name="i-lucide-loader-circle" class="size-8 animate-spin text-white/70" />
        <iframe
          v-else-if="embedUrl"
          :src="embedUrl"
          title="Trailer"
          class="w-full h-full"
          allow="autoplay; encrypted-media; fullscreen"
          allowfullscreen
        />
        <div v-else class="text-center text-white/60 p-6">
          <UIcon name="i-lucide-video-off" class="size-8 mx-auto" />
          <p class="mt-2 text-sm">
            No trailer found for this movie.
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
