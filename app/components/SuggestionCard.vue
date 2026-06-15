<script setup lang="ts">
import type { Suggestion } from '#shared/types/suggestion'

const props = defineProps<{ suggestion: Suggestion }>()
const emit = defineEmits<{ vote: []; unvote: []; remove: [] }>()

const { user } = useAuth()
const { posterUrl } = useTmdb()

const movie = computed(() => props.suggestion.suggestedItem)
const poster = computed(() => posterUrl(movie.value.poster_path))
const year = computed(() => movie.value.release_date?.slice(0, 4) ?? '')
const overview = computed(() => {
  const text = movie.value.overview
  if (!text) return ''
  return text.length > 220 ? `${text.slice(0, 220).trimEnd()}…` : text
})
const voteCount = computed(() => props.suggestion.votesCount ?? props.suggestion.votes?.length ?? 0)
const hasVoted = computed(() =>
  Boolean(user.value) && (props.suggestion.votes ?? []).some(v => v.userId === user.value!.uid)
)
const isOwner = computed(() =>
  Boolean(user.value) && props.suggestion.userReference?.id === user.value!.uid
)
const tmdbUrl = computed(() => `https://www.themoviedb.org/movie/${movie.value.id}`)
</script>

<template>
  <UCard variant="subtle">
    <div class="flex gap-4">
      <img
        v-if="poster"
        :src="poster"
        :alt="movie.title"
        class="h-36 w-24 rounded-md object-cover bg-elevated shrink-0"
      >
      <div v-else class="h-36 w-24 rounded-md bg-elevated shrink-0 flex items-center justify-center">
        <UIcon name="i-lucide-film" class="size-8 text-muted" />
      </div>

      <div class="min-w-0 flex-1 flex flex-col">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold text-lg leading-tight">
            {{ movie.title }}
            <span v-if="year" class="text-muted font-normal">({{ year }})</span>
          </h3>
          <UButton
            v-if="isOwner"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Remove suggestion"
            @click="emit('remove')"
          />
        </div>

        <p v-if="overview" class="text-sm text-muted mt-1 flex-1">
          {{ overview }}
        </p>

        <div class="flex items-center justify-between gap-2 mt-3">
          <ULink
            :to="tmdbUrl"
            target="_blank"
            class="text-sm text-primary inline-flex items-center gap-1"
          >
            Details <UIcon name="i-lucide-external-link" class="size-3.5" />
          </ULink>

          <UButton
            :color="hasVoted ? 'error' : 'neutral'"
            :variant="hasVoted ? 'soft' : 'outline'"
            icon="i-lucide-heart"
            :label="String(voteCount)"
            @click="hasVoted ? emit('unvote') : emit('vote')"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>
