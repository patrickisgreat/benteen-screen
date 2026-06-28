<script setup lang="ts">
import type { Suggestion } from '#shared/types/suggestion'

// canVote defaults to true via withDefaults: a *typed* boolean prop that's absent
// is cast to `false` by Vue, which would wrongly disable voting wherever the prop
// isn't passed — the default makes "voting allowed" the explicit fallback.
const props = withDefaults(
  defineProps<{ suggestion: Suggestion, rank: number, maxVotes: number, locked?: boolean, voteCapReached?: boolean, canVote?: boolean }>(),
  { canVote: true }
)
const emit = defineEmits<{ vote: [], unvote: [], remove: [], trailer: [], blurb: [text: string] }>()

const { myId } = useAuth()

const movie = computed(() => props.suggestion.tmdb_movie)

// "What it's about" (TMDB synopsis) — clamped, click to expand.
const overviewOpen = ref(false)

// The suggester's personal take — owner can add/edit; saving emits the new text
// (empty clears it). Parent persists via the author-only RPC.
const editingBlurb = ref(false)
const blurbDraft = ref('')
function startBlurb(): void {
  blurbDraft.value = props.suggestion.blurb ?? ''
  editingBlurb.value = true
}
function saveBlurb(): void {
  emit('blurb', blurbDraft.value.trim())
  editingBlurb.value = false
}
// Attribute the pitch to the suggester by name (falls back if the name is missing).
const suggesterName = computed(() => props.suggestion.author?.display_name?.trim() || null)
const pitchHeader = computed(() => (suggesterName.value ? `${suggesterName.value}'s Personal Pitch` : 'Personal Pitch'))
const year = computed(() => movieYear(movie.value))
// Public count from the tally (votes.length would only see the viewer's own vote).
const voteCount = computed(() => props.suggestion.voteCount ?? 0)
const hasVoted = computed(() =>
  Boolean(myId.value) && (props.suggestion.votes ?? []).some(v => v.user_id === myId.value)
)
// Can't add a *new* vote at the cap or when you're not RSVP'd "going" — but you
// can always remove a vote you've already cast (to switch your pick / back out).
const voteDisabled = computed(() => !hasVoted.value && (Boolean(props.voteCapReached) || !props.canVote))
const voteDisabledTitle = computed(() => {
  if (!voteDisabled.value) return undefined
  return !props.canVote
    ? 'RSVP "Going" to vote on movies'
    : 'Vote limit reached — remove a vote to switch your pick'
})
const isOwner = computed(() =>
  Boolean(myId.value) && props.suggestion.user_id === myId.value
)
const barPct = computed(() => (props.maxVotes > 0 ? Math.round((voteCount.value / props.maxVotes) * 100) : 0))

// Only award medals once there are votes — otherwise the order is just by
// created_at and "rank 1" is meaningless (and ties are arbitrary).
const rankClass = computed(() => {
  if (voteCount.value === 0) return 'bg-elevated text-muted'
  switch (props.rank) {
    case 1: return 'bg-amber-400 text-black'
    case 2: return 'bg-zinc-300 text-black'
    case 3: return 'bg-amber-700 text-white'
    default: return 'bg-elevated text-muted'
  }
})
const highlight = computed(() => props.rank === 1 && voteCount.value > 0)

// The floating-heart flourish is a teleported overlay; spawn it at the tapped
// button's center (works for mouse + keyboard) optimistically on click — it's a
// flourish, not a state indicator — then emit the actual action.
const hearts = useTemplateRef<{ spawn: (kind: 'vote' | 'unvote', x: number, y: number) => void }>('hearts')
function onHeartClick(e: MouseEvent): void {
  const rect = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  const x = rect ? rect.left + rect.width / 2 : e.clientX
  const y = rect ? rect.top + rect.height / 2 : e.clientY
  if (hasVoted.value) {
    hearts.value?.spawn('unvote', x, y)
    emit('unvote')
  } else {
    hearts.value?.spawn('vote', x, y)
    emit('vote')
  }
}
</script>

<template>
  <UCard variant="subtle" :class="highlight ? 'ring-2 ring-primary/40' : ''" :ui="{ body: 'sm:p-4 p-3' }">
    <div class="flex items-start gap-3">
      <!-- rank -->
      <div class="shrink-0 flex items-center justify-center size-7 rounded-full font-bold text-sm" :class="rankClass">
        {{ rank }}
      </div>

      <!-- poster -->
      <MoviePoster :path="movie.poster_path" :alt="movie.title" size="w185" />

      <!-- content -->
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold leading-tight truncate min-w-0 flex-1">
            {{ movie.title }}
            <span v-if="year" class="text-muted font-normal">({{ year }})</span>
          </h3>
          <UBadge
            v-if="locked"
            icon="i-lucide-heart"
            :label="String(voteCount)"
            :color="highlight ? 'primary' : 'neutral'"
            variant="subtle"
            size="md"
            class="shrink-0"
          />
          <div v-else class="relative shrink-0">
            <UButton
              :color="hasVoted ? 'error' : 'neutral'"
              :variant="hasVoted ? 'soft' : 'outline'"
              icon="i-lucide-heart"
              :label="String(voteCount)"
              size="sm"
              :disabled="voteDisabled"
              :title="voteDisabledTitle"
              :aria-label="hasVoted ? 'Remove vote' : 'Vote'"
              @click="onHeartClick"
            />
            <FloatingHearts ref="hearts" />
          </div>
        </div>

        <!-- relative vote bar -->
        <div class="mt-2 h-1.5 rounded-full bg-elevated overflow-hidden">
          <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${barPct}%` }" />
        </div>

        <div class="flex items-center gap-1 mt-2">
          <UButton
            label="Trailer"
            icon="i-lucide-play"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="emit('trailer')"
          />
          <UButton
            v-if="isOwner && !locked"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Remove suggestion"
            @click="emit('remove')"
          />
        </div>

        <!-- What it's about (TMDB synopsis) — for anyone who'd rather not watch the trailer. -->
        <button
          v-if="movie.overview"
          type="button"
          class="text-xs text-muted mt-2 text-left w-full cursor-pointer"
          :class="overviewOpen ? '' : 'line-clamp-2'"
          @click="overviewOpen = !overviewOpen"
        >
          {{ movie.overview }}
        </button>

        <!-- The suggester's personal take. -->
        <div v-if="editingBlurb" class="mt-2 space-y-1">
          <UTextarea
            v-model="blurbDraft"
            :rows="2"
            :maxlength="500"
            autoresize
            placeholder="Why should we screen this? (optional)"
            class="w-full"
          />
          <div class="flex items-center gap-1">
            <UButton label="Save" icon="i-lucide-check" size="xs" @click="saveBlurb" />
            <UButton label="Cancel" color="neutral" variant="ghost" size="xs" @click="editingBlurb = false" />
          </div>
        </div>
        <template v-else>
          <blockquote v-if="suggestion.blurb" class="mt-2 border-l-2 border-primary/40 pl-2.5">
            <p class="text-xs font-semibold text-primary">
              {{ pitchHeader }}:
            </p>
            <p class="text-sm font-medium italic text-default mt-0.5">
              “{{ suggestion.blurb }}”
              <UButton v-if="isOwner && !locked" label="edit" color="primary" variant="link" size="xs" class="not-italic font-normal align-baseline ml-1 p-0" @click="startBlurb" />
            </p>
          </blockquote>
          <UButton
            v-else-if="isOwner && !locked"
            label="Add your take"
            icon="i-lucide-message-square-plus"
            color="neutral"
            variant="ghost"
            size="xs"
            class="mt-1"
            @click="startBlurb"
          />
        </template>
      </div>
    </div>
  </UCard>
</template>
