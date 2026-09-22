import type { MaybeRefOrGetter } from 'vue'
import {
  ANNOUNCE_PRESETS,
  DEFAULT_ANNOUNCE_PRESET,
  announcePresetMembers,
  describeAnnounceSelection,
  type AnnouncePerson,
  type AnnouncePreset,
  type AnnounceScope
} from '#shared/utils/announce'

export interface AnnounceAudience {
  /** This event's whole address book, sorted by name. */
  people: Ref<AnnouncePerson[]>
  /** The addresses that will actually be mailed. */
  selected: Ref<string[]>
  /** The address book filtered by `search` — what the picker renders. */
  visible: ComputedRef<AnnouncePerson[]>
  search: Ref<string>
  pending: Ref<boolean>
  error: Ref<string | null>
  /** How many people each preset covers, for the buttons' counts. */
  counts: ComputedRef<Record<AnnouncePreset, number>>
  /** Which preset the current selection matches, or `custom`. */
  activeScope: ComputedRef<AnnounceScope>
  allVisibleSelected: ComputedRef<boolean>
  applyPreset: (id: AnnouncePreset) => void
  toggle: (email: string) => void
  setVisible: (on: boolean) => void
  refresh: () => Promise<void>
}

/**
 * The audience for an event's blast: who could be mailed, who will be, and the
 * shortcuts between the two. Loads once per event and opens on the people who
 * have RSVP'd yes — the blast an admin almost always means — leaving every other
 * grouping one click away and every individual one tick away.
 *
 * The directory comes from the server (`/api/events/[id]/announce-recipients`)
 * because the send validates against the same list; presets are predicates over
 * it, shared with the server so the log names a selection the same way the
 * composer does.
 */
export function useAnnounceRecipients(
  eventId: MaybeRefOrGetter<string | undefined | null>
): AnnounceAudience {
  const people = ref<AnnouncePerson[]>([])
  const selected = ref<string[]>([])
  const search = ref('')
  const pending = ref(false)
  const error = ref<string | null>(null)
  // Only the newest load may write state — a slow response for an event the
  // admin has already navigated away from must not repopulate the picker.
  let latest = 0

  async function refresh(): Promise<void> {
    const id = toValue(eventId)
    const token = ++latest
    search.value = ''
    if (!id) {
      people.value = []
      selected.value = []
      return
    }
    pending.value = true
    try {
      const res = await $fetch<{ people: AnnouncePerson[] }>(`/api/events/${id}/announce-recipients`)
      if (token !== latest) return
      error.value = null
      people.value = res.people
      selected.value = announcePresetMembers(res.people, DEFAULT_ANNOUNCE_PRESET)
    } catch (e) {
      if (token !== latest) return
      console.error('[useAnnounceRecipients]', e)
      error.value = 'Could not load the recipient list'
      people.value = []
      selected.value = []
    } finally {
      if (token === latest) pending.value = false
    }
  }

  const visible = computed(() => {
    const term = search.value.trim().toLowerCase()
    if (!term) return people.value
    return people.value.filter(p =>
      p.email.includes(term) || (p.name ?? '').toLowerCase().includes(term))
  })

  const counts = computed(() =>
    Object.fromEntries(ANNOUNCE_PRESETS.map(preset =>
      [preset.id, people.value.filter(preset.includes).length]
    )) as Record<AnnouncePreset, number>)

  const activeScope = computed(() => describeAnnounceSelection(people.value, selected.value))

  const allVisibleSelected = computed(() =>
    visible.value.length > 0 && visible.value.every(p => selected.value.includes(p.email)))

  function applyPreset(id: AnnouncePreset): void {
    selected.value = announcePresetMembers(people.value, id)
  }

  function toggle(email: string): void {
    const without = selected.value.filter(e => e !== email)
    selected.value = without.length === selected.value.length ? [...without, email] : without
  }

  /** Tick or untick everyone the search currently shows, leaving the rest alone. */
  function setVisible(on: boolean): void {
    const shown = new Set(visible.value.map(p => p.email))
    const rest = selected.value.filter(e => !shown.has(e))
    selected.value = on ? [...rest, ...shown] : rest
  }

  watch(() => toValue(eventId), () => void refresh(), { immediate: true })

  return {
    people,
    selected,
    visible,
    search,
    pending,
    error,
    counts,
    activeScope,
    allVisibleSelected,
    applyPreset,
    toggle,
    setVisible,
    refresh
  }
}
