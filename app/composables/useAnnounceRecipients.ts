import type { MaybeRefOrGetter } from 'vue'
import type { AnnounceRecipient, AnnounceScope } from '#shared/utils/announce'

/**
 * The audience a blast would reach, previewed before it's sent. Reloads whenever
 * the event or the scope changes, and tracks which addresses are still ticked so
 * the admin can drop individuals from the send.
 *
 * Resolution lives on the server (`/api/events/[id]/announce-recipients`) because
 * the send route resolves the same way — a preview computed separately in the
 * browser would be a second implementation to drift from what actually sends.
 */
export function useAnnounceRecipients(
  eventId: MaybeRefOrGetter<string | undefined | null>,
  scope: MaybeRefOrGetter<AnnounceScope>
): {
  recipients: Ref<AnnounceRecipient[]>
  selected: Ref<string[]>
  pending: Ref<boolean>
  error: Ref<string | null>
  allSelected: ComputedRef<boolean>
  toggle: (email: string) => void
  toggleAll: (on: boolean) => void
  refresh: () => Promise<void>
} {
  const recipients = ref<AnnounceRecipient[]>([])
  const selected = ref<string[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)
  // Only the newest load may write state — a slow earlier scope must not land
  // after a faster later one and repopulate the list with the wrong audience.
  let latest = 0

  async function refresh(): Promise<void> {
    const id = toValue(eventId)
    const token = ++latest
    if (!id) {
      recipients.value = []
      selected.value = []
      return
    }
    pending.value = true
    try {
      const res = await $fetch<{ count: number, recipients: AnnounceRecipient[] }>(
        `/api/events/${id}/announce-recipients`,
        { query: { scope: toValue(scope) } }
      )
      if (token !== latest) return
      error.value = null
      recipients.value = res.recipients
      // A fresh audience starts fully ticked: narrowing is a deliberate act.
      selected.value = res.recipients.map(r => r.email)
    } catch (e) {
      if (token !== latest) return
      console.error('[useAnnounceRecipients]', e)
      error.value = 'Could not load the recipient list'
      recipients.value = []
      selected.value = []
    } finally {
      if (token === latest) pending.value = false
    }
  }

  const allSelected = computed(() =>
    recipients.value.length > 0 && selected.value.length === recipients.value.length)

  function toggle(email: string): void {
    const without = selected.value.filter(e => e !== email)
    selected.value = without.length === selected.value.length ? [...without, email] : without
  }

  function toggleAll(on: boolean): void {
    selected.value = on ? recipients.value.map(r => r.email) : []
  }

  watch([() => toValue(eventId), () => toValue(scope)], () => void refresh(), { immediate: true })

  return { recipients, selected, pending, error, allSelected, toggle, toggleAll, refresh }
}
