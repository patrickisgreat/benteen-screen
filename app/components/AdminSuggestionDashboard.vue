<script setup lang="ts">
import type { AdminSuggestion } from '#shared/types/suggestion'

const props = defineProps<{
  suggestions: AdminSuggestion[]
  /** People who RSVP'd (going/maybe) — to surface who hasn't suggested/voted. */
  expected?: { userId: string, name: string }[]
  winnerIds?: string[]
  votingLocked?: boolean
}>()
const emit = defineEmits<{ toggle: [id: string, deleted: boolean] }>()

type View = 'movies' | 'people' | 'gaps'
type Sort = 'votes' | 'newest' | 'title'
type Filter = 'all' | 'visible' | 'hidden'

const view = ref<View>('movies')
const sort = ref<Sort>('votes')
const filter = ref<Filter>('all')

const views = [
  { value: 'movies' as const, label: 'Movies', icon: 'i-lucide-clapperboard' },
  { value: 'people' as const, label: 'People', icon: 'i-lucide-users' },
  { value: 'gaps' as const, label: 'Gaps', icon: 'i-lucide-user-x' }
]
const sorts = [
  { value: 'votes' as const, label: 'Most votes' },
  { value: 'newest' as const, label: 'Newest' },
  { value: 'title' as const, label: 'Title' }
]
const filters = [
  { value: 'all' as const, label: 'All' },
  { value: 'visible' as const, label: 'Visible' },
  { value: 'hidden' as const, label: 'Hidden' }
]

const dashboard = computed(() =>
  computeSuggestionDashboard({ suggestions: props.suggestions, winnerIds: props.winnerIds, expected: props.expected })
)

const movies = computed(() => {
  const filtered = props.suggestions.filter((s) => {
    if (filter.value === 'visible') return !s.deleted
    if (filter.value === 'hidden') return s.deleted
    return true
  })
  return [...filtered].sort((a, b) => {
    if (sort.value === 'title') return a.tmdb_movie.title.localeCompare(b.tmdb_movie.title)
    if (sort.value === 'newest') return (b.created_at ?? '').localeCompare(a.created_at ?? '')
    return (b.voteCount ?? 0) - (a.voteCount ?? 0)
  })
})

function voterNames(s: AdminSuggestion): string[] {
  return (s.votes ?? []).map(v => v.voter?.display_name ?? 'Unknown')
}
</script>

<template>
  <div class="space-y-4">
    <!-- Headline stats -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ dashboard.summary.suggestions }}
        </p>
        <p class="text-xs text-muted">
          movies
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ dashboard.summary.votes }}
        </p>
        <p class="text-xs text-muted">
          votes
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ dashboard.summary.submitters }}
        </p>
        <p class="text-xs text-muted">
          submitters
        </p>
      </UCard>
      <UCard variant="subtle" :ui="{ body: 'p-3' }">
        <p class="text-xl font-bold">
          {{ dashboard.summary.voters }}
        </p>
        <p class="text-xs text-muted">
          voters
        </p>
      </UCard>
    </div>

    <div v-if="dashboard.summary.mostVoted || dashboard.summary.topVoters.length" class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <p v-if="dashboard.summary.mostVoted && dashboard.summary.mostVoted.votes > 0">
        <span class="text-muted">Leading:</span>
        <span class="font-medium">{{ dashboard.summary.mostVoted.title }}</span>
        <span class="text-muted">({{ dashboard.summary.mostVoted.votes }})</span>
      </p>
      <p v-if="dashboard.summary.topVoters.length">
        <span class="text-muted">Top voters:</span>
        <span class="font-medium">{{ dashboard.summary.topVoters.map(v => `${v.name} (${v.votes})`).join(', ') }}</span>
      </p>
    </div>

    <!-- View switch -->
    <div class="flex flex-wrap items-center justify-between gap-2">
        <UButton
          v-for="v in views"
          :key="v.value"
          :label="v.label"
          :icon="v.icon"
          size="sm"
          :color="view === v.value ? 'primary' : 'neutral'"
          :variant="view === v.value ? 'solid' : 'outline'"
          :aria-pressed="view === v.value"
          @click="view = v.value"
        />
      </div>
      <div v-if="view === 'movies'" class="flex flex-wrap gap-1">
        <USelectMenu v-model="sort" :items="sorts" value-key="value" :search-input="false" size="sm" class="w-36" />
        <USelectMenu v-model="filter" :items="filters" value-key="value" :search-input="false" size="sm" class="w-28" />
      </div>
    </div>

    <!-- MOVIES -->
    <div v-if="view === 'movies'" class="space-y-3">
      <UCard
        v-for="s in movies"
        :key="s.id"
        variant="subtle"
        :class="s.deleted ? 'opacity-60' : ''"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-semibold">
              {{ s.tmdb_movie.title }}
              <UBadge v-if="s.deleted" label="Hidden" color="neutral" variant="subtle" size="xs" />
              <UBadge v-if="winnerIds?.includes(s.id)" label="Winner" color="primary" variant="subtle" size="xs" />
            </h3>
            <p class="text-sm text-muted truncate">
              by {{ s.author?.display_name || s.author?.email || 'unknown' }}
            </p>
            <p class="text-sm mt-1">
              <UIcon name="i-lucide-heart" class="text-error align-text-bottom" />
              {{ s.voteCount ?? 0 }} votes
            </p>
            <div v-if="voterNames(s) as names" class="flex flex-wrap gap-1 mt-2">
              <UBadge
                v-for="(name, i) in names"
                :key="`${s.id}-${i}`"
                :label="name"
                color="neutral"
                variant="outline"
                size="xs"
              />
            </div>
          </div>
          <UButton
            v-if="s.deleted"
            label="Restore"
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="outline"
            size="sm"
            class="shrink-0"
            @click="emit('toggle', s.id, false)"
          />
          <UButton
            v-else
            label="Hide"
            icon="i-lucide-eye-off"
            color="error"
            variant="outline"
            size="sm"
            class="shrink-0"
            @click="emit('toggle', s.id, true)"
          />
        </div>
      </UCard>
      <UCard v-if="!movies.length" variant="subtle" class="text-center text-muted">
        No suggestions for this filter.
      </UCard>
    </div>

    <!-- PEOPLE -->
    <div v-else-if="view === 'people'" class="space-y-3">
      <UCard v-for="p in dashboard.byPerson" :key="p.userId" variant="subtle">
        <p class="font-semibold mb-2">
          {{ p.name }}
        </p>
        <div class="grid sm:grid-cols-2 gap-3">
          <div>
            <p class="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
              <UIcon name="i-lucide-clapperboard" /> Suggested · {{ p.suggested.length }}
            </p>
            <ul v-if="p.suggested.length" class="space-y-1">
              <li v-for="m in p.suggested" :key="m.id" class="text-sm flex items-center gap-1.5">
                <span class="truncate">{{ m.title }}</span>
                <UBadge :label="`${m.votes}`" icon="i-lucide-heart" color="neutral" variant="subtle" size="xs" class="shrink-0" />
                <UBadge v-if="m.won" label="Winner" color="primary" variant="subtle" size="xs" class="shrink-0" />
              </li>
            </ul>
            <p v-else class="text-sm text-muted">
              —
            </p>
          </div>
          <div>
            <p class="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
              <UIcon name="i-lucide-heart" /> Voted for · {{ p.votedFor.length }}
            </p>
            <ul v-if="p.votedFor.length" class="space-y-1">
              <li v-for="m in p.votedFor" :key="m.id" class="text-sm truncate">
                {{ m.title }}
              </li>
            </ul>
            <p v-else class="text-sm text-muted">
              —
            </p>
          </div>
        </div>
      </UCard>
      <UCard v-if="!dashboard.byPerson.length" variant="subtle" class="text-center text-muted">
        No participation yet.
      </UCard>
    </div>

    <!-- GAPS -->
    <div v-else class="space-y-2">
      <p class="text-sm text-muted">
        Coming (RSVP'd going/maybe) but haven't fully joined in — nudge them.
      </p>
      <UCard v-for="g in dashboard.gaps" :key="g.userId" variant="subtle" :ui="{ body: 'p-3' }">
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium truncate">{{ g.name }}</span>
          <div class="flex gap-1 shrink-0">
            <UBadge v-if="!g.suggested" label="No suggestion" icon="i-lucide-clapperboard" color="warning" variant="subtle" size="xs" />
            <UBadge v-if="!g.voted" label="No vote" icon="i-lucide-heart" color="warning" variant="subtle" size="xs" />
          </div>
        </div>
      </UCard>
      <UCard v-if="!dashboard.gaps.length" variant="subtle" class="text-center text-muted">
        Everyone who RSVP'd has suggested and voted. 🎉
      </UCard>
    </div>
  </div>
</template>
