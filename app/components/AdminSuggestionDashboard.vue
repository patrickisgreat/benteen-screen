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
type Sort = 'votes' | 'newest' | 'title' | 'submitter'
type Filter = 'all' | 'visible' | 'hidden'

const view = ref<View>('movies')
const sort = ref<Sort>('votes')
const filter = ref<Filter>('all')
const submitter = ref<string>('all')
const query = ref('')

const views = [
  { value: 'movies' as const, label: 'Movies', icon: 'i-lucide-clapperboard' },
  { value: 'people' as const, label: 'People', icon: 'i-lucide-users' },
  { value: 'gaps' as const, label: 'Gaps', icon: 'i-lucide-user-x' }
]
const sorts = [
  { value: 'votes' as const, label: 'Most votes' },
  { value: 'newest' as const, label: 'Newest' },
  { value: 'title' as const, label: 'Title' },
  { value: 'submitter' as const, label: 'Submitter' }
]
const filters = [
  { value: 'all' as const, label: 'All' },
  { value: 'visible' as const, label: 'Visible' },
  { value: 'hidden' as const, label: 'Hidden' }
]

const dashboard = computed(() =>
  computeSuggestionDashboard({ suggestions: props.suggestions, winnerIds: props.winnerIds, expected: props.expected })
)

function authorName(s: AdminSuggestion): string {
  return s.author?.display_name ?? s.author?.email ?? 'unknown'
}

// Distinct submitters for the filter dropdown (live suggestions only).
const submitterOptions = computed(() => {
  const byId = new Map<string, string>()
  for (const s of props.suggestions) if (!s.deleted) byId.set(s.user_id, authorName(s))
  return [
    { value: 'all', label: 'All submitters' },
    ...[...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  ]
})

// The widest vote bar scales to the most-voted movie (min 1 so it never divides by 0).
const maxVotes = computed(() => Math.max(1, ...props.suggestions.map(s => s.voteCount ?? 0)))

function matches(text: string): boolean {
  const q = query.value.trim().toLowerCase()
  return !q || text.toLowerCase().includes(q)
}

const movies = computed(() => {
  const filtered = props.suggestions.filter((s) => {
    if (filter.value === 'visible' && s.deleted) return false
    if (filter.value === 'hidden' && !s.deleted) return false
    if (submitter.value !== 'all' && s.user_id !== submitter.value) return false
    return matches(s.tmdb_movie.title)
  })
  return [...filtered].sort((a, b) => {
    if (sort.value === 'title') return a.tmdb_movie.title.localeCompare(b.tmdb_movie.title)
    if (sort.value === 'newest') return (b.created_at ?? '').localeCompare(a.created_at ?? '')
    if (sort.value === 'submitter') return authorName(a).localeCompare(authorName(b))
    return (b.voteCount ?? 0) - (a.voteCount ?? 0)
  })
})

const people = computed(() => dashboard.value.byPerson.filter(p => matches(p.name)))
const people = computed(() => dashboard.value.byPerson.filter(p => matches(p.name)))

function barPct(votes: number): number {
  return Math.round((votes / maxVotes.value) * 100)
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

    <div
      v-if="(dashboard.summary.mostVoted && dashboard.summary.mostVoted.votes > 0) || dashboard.summary.topVoters.length"
      class="flex flex-wrap gap-x-6 gap-y-1 text-sm"
    >
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

    <!-- View switch + search -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex gap-1">
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
      <UInput
        v-model="query"
        icon="i-lucide-search"
        :placeholder="view === 'movies' ? 'Search movies…' : 'Search people…'"
        size="sm"
        class="w-full sm:w-56"
      />
    </div>

    <!-- Movies controls -->
    <div v-if="view === 'movies'" class="flex flex-wrap gap-1">
      <USelectMenu v-model="sort" :items="sorts" value-key="value" :search-input="false" size="sm" class="w-40" />
      <USelectMenu v-model="filter" :items="filters" value-key="value" :search-input="false" size="sm" class="w-28" />
      <USelectMenu v-model="submitter" :items="submitterOptions" value-key="value" :search-input="false" size="sm" class="w-44" />
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
          <div class="min-w-0 flex-1">
            <h3 class="font-semibold">
              {{ s.tmdb_movie.title }}
              <UBadge v-if="s.deleted" label="Hidden" color="neutral" variant="subtle" size="xs" />
              <UBadge v-if="winnerIds?.includes(s.id)" label="Winner" color="primary" variant="subtle" size="xs" />
            </h3>
            <p class="text-sm text-muted truncate">
              by {{ authorName(s) }}
            </p>
            <p class="text-sm mt-1 inline-flex items-center gap-1">
              <UIcon name="i-lucide-heart" class="text-error" />
              {{ s.voteCount ?? 0 }} {{ (s.voteCount ?? 0) === 1 ? 'vote' : 'votes' }}
            </p>
            <!-- Vote-share bar -->
            <div class="mt-1.5 h-1.5 max-w-xs rounded-full bg-elevated overflow-hidden">
              <div class="h-full rounded-full bg-primary transition-all" :style="{ width: `${barPct(s.voteCount ?? 0)}%` }" />
            </div>
            <div v-if="(s.votes ?? []).length" class="flex flex-wrap gap-1 mt-2">
              <UBadge
                v-for="(v, i) in (s.votes ?? [])"
                :key="`${s.id}-${i}`"
                :label="v.voter?.display_name ?? 'Unknown'"
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
        No suggestions match.
      </UCard>
    </div>

    <!-- PEOPLE -->
    <div v-else-if="view === 'people'" class="space-y-3">
      <UCard v-for="p in people" :key="p.userId" variant="subtle">
        <div class="flex items-center justify-between gap-2 mb-2">
          <p class="font-semibold truncate">
            {{ p.name }}
          </p>
          <div class="flex gap-1 shrink-0">
            <UBadge :label="`${p.suggested.length} suggested`" icon="i-lucide-clapperboard" color="neutral" variant="subtle" size="xs" />
            <UBadge :label="`${p.votedFor.length} voted`" icon="i-lucide-heart" color="neutral" variant="subtle" size="xs" />
          </div>
        </div>
        <div class="grid sm:grid-cols-2 gap-3">
          <div>
            <p class="text-xs font-semibold text-muted mb-1.5">
              Suggested
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
            <p class="text-xs font-semibold text-muted mb-1.5">
              Voted for
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
      <UCard v-if="!people.length" variant="subtle" class="text-center text-muted">
        No one matches.
      </UCard>
    </div>

    <!-- GAPS -->
    <div v-else class="space-y-2">
      <p class="text-sm text-muted">
        Coming (RSVP'd going/maybe) but haven't fully joined in — nudge them.
      </p>
      <UCard v-for="g in gaps" :key="g.userId" variant="subtle" :ui="{ body: 'p-3' }">
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium truncate">{{ g.name }}</span>
          <div class="flex gap-1 shrink-0">
            <UBadge v-if="!g.suggested" label="No suggestion" icon="i-lucide-clapperboard" color="warning" variant="subtle" size="xs" />
            <UBadge v-if="!g.voted" label="No vote" icon="i-lucide-heart" color="warning" variant="subtle" size="xs" />
          </div>
        </div>
      </UCard>
      <UCard v-if="!gaps.length" variant="subtle" class="text-center text-muted">
        {{ dashboard.gaps.length ? 'No one matches.' : 'Everyone who RSVP\'d has suggested and voted. 🎉' }}
      </UCard>
    </div>
  </div>
</template>
