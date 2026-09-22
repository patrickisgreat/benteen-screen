// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventAnnounceComposer from '../app/components/EventAnnounceComposer.vue'
import {
  ANNOUNCE_PRESETS,
  announcePresetMembers,
  describeAnnounceSelection,
  type AnnouncePerson,
  type AnnouncePreset
} from '../shared/utils/announce'

const calls: Array<{ url: string, body: unknown }> = []
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

// The tiptap editor needs a real DOM selection model; stub it with a textarea
// that honors the same v-model contract so tests drive the message like text.
const RichTextEditorStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('textarea', {
      value: props.modelValue,
      onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
    })
  }
})

const templates = ref([
  { id: 't1', name: 'Vote & bring list reminder', subject: 'Vote + bring list', body: '<p>Go <strong>vote</strong>!</p>' },
  { id: 't2', name: 'Plain nudge', subject: null, body: '<p>Nudge</p>' }
])
const saveTemplate = vi.fn(() => Promise.resolve())
const removeTemplate = vi.fn(() => Promise.resolve())
mockNuxtImport('useCommsTemplates', () => () => ({
  templates,
  error: ref(null),
  refresh: () => Promise.resolve(),
  saveTemplate,
  removeTemplate
}))

const person = (over: Partial<AnnouncePerson> & { email: string }): AnnouncePerson => ({
  name: null, rsvp: null, onGuestList: true, joined: true, onRoster: true, ...over
})

const DIRECTORY: AnnouncePerson[] = [
  person({ email: 'ada@example.com', name: 'Ada', rsvp: 'maybe' }),
  person({ email: 'alan@example.com', name: 'Alan', rsvp: 'no' }),
  person({ email: 'grace@example.com', name: 'Grace', rsvp: 'going' }),
  person({ email: 'hedy@example.com', name: 'Hedy', rsvp: null }),
  person({ email: 'newcomer@example.com', name: 'Newcomer', onGuestList: false, joined: false })
]

// Fetching the directory is the composable's job (covered in its own spec). This
// stand-in keeps the real preset logic so the composer is tested against the
// selection behavior it actually ships with.
const people = ref<AnnouncePerson[]>([])
const selected = ref<string[]>([])
const search = ref('')
mockNuxtImport('useAnnounceRecipients', () => () => {
  const visible = computed(() => {
    const term = search.value.trim().toLowerCase()
    if (!term) return people.value
    return people.value.filter(p => p.email.includes(term) || (p.name ?? '').toLowerCase().includes(term))
  })
  return {
    people,
    selected,
    visible,
    search,
    pending: ref(false),
    error: ref(null),
    counts: computed(() => Object.fromEntries(
      ANNOUNCE_PRESETS.map(preset => [preset.id, people.value.filter(preset.includes).length]))),
    activeScope: computed(() => describeAnnounceSelection(people.value, selected.value)),
    allVisibleSelected: computed(() =>
      visible.value.length > 0 && visible.value.every(p => selected.value.includes(p.email))),
    applyPreset: (id: AnnouncePreset) => {
      selected.value = announcePresetMembers(people.value, id)
    },
    toggle: (email: string) => {
      selected.value = selected.value.includes(email)
        ? selected.value.filter(e => e !== email)
        : [...selected.value, email]
    },
    setVisible: (on: boolean) => {
      const shown = new Set(visible.value.map(p => p.email))
      const rest = selected.value.filter(e => !shown.has(e))
      selected.value = on ? [...rest, ...shown] : rest
    },
    refresh: () => Promise.resolve()
  }
})

async function mountComposer() {
  return await mountSuspended(EventAnnounceComposer, {
    props: { eventId: 'e1' },
    global: { stubs: { RichTextEditor: RichTextEditorStub } }
  })
}

type Composer = Awaited<ReturnType<typeof mountComposer>>

/** Click a control by its aria-label (Nuxt UI renders its own checkbox, so a
 *  click is the honest interaction — setValue on the input never reaches it). */
async function clickLabelled(w: Composer, label: string): Promise<void> {
  await w.get(`[aria-label="${label}"]`).trigger('click')
}

async function clickButton(w: Composer, text: string): Promise<void> {
  const button = w.findAll('button').find(b => b.text().includes(text))
  if (!button) throw new Error(`no button matching "${text}"`)
  await button.trigger('click')
}

beforeEach(() => {
  calls.length = 0
  people.value = [...DIRECTORY]
  selected.value = announcePresetMembers(DIRECTORY, 'going')
  search.value = ''
  saveTemplate.mockClear()
  removeTemplate.mockClear()
  vi.stubGlobal('$fetch', (url: string, opts: { body: unknown }) => {
    calls.push({ url, body: opts.body })
    return Promise.resolve({ ok: true, count: selected.value.length })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('EventAnnounceComposer', () => {
  it('opens on the people going and says that is the default', async () => {
    const w = await mountComposer()
    expect(w.text()).toContain('Sending to 1 person')
    expect(w.text()).toContain('Going')
    expect(w.text()).toContain('Default')
    expect(w.text()).toContain('Everyone who has RSVP\'d yes to this event')
  })

  it('sends to exactly the people ticked', async () => {
    const w = await mountComposer()
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls[0]?.url).toBe('/api/events/announce')
    expect(calls[0]?.body).toMatchObject({ eventId: 'e1', message: 'Doors at 7', recipients: ['grace@example.com'] })
  })

  it('re-picks the list from a group, counts and all', async () => {
    const w = await mountComposer()
    await clickButton(w, 'Whole guest list (4)')
    expect(w.text()).toContain('Sending to 4 people')
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls[0]?.body).toMatchObject({
      recipients: ['ada@example.com', 'alan@example.com', 'grace@example.com', 'hedy@example.com']
    })
  })

  it('adds one person to the default without leaving it', async () => {
    const w = await mountComposer()
    await clickLabelled(w, 'Send to Hedy')
    expect(w.text()).toContain('Sending to 2 people')
    expect(w.text()).toContain('Hand-picked')
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls[0]?.body).toMatchObject({ recipients: ['grace@example.com', 'hedy@example.com'] })
  })

  it('offers a way back to the default once the list is edited', async () => {
    const w = await mountComposer()
    await clickLabelled(w, 'Send to Hedy')
    await clickButton(w, 'Reset to Going')
    expect(selected.value).toEqual(['grace@example.com'])
    expect(w.text()).toContain('Sending to 1 person')
  })

  it('shows each person\'s reply beside their name', async () => {
    const w = await mountComposer()
    expect(w.text()).toContain('Ada')
    expect(w.text()).toContain('ada@example.com')
    expect(w.text()).toContain('Maybe')
    expect(w.text()).toContain('No reply')
    expect(w.text()).toContain('Can\'t make it')
  })

  it('marks someone who is not actually invited to this event', async () => {
    const w = await mountComposer()
    expect(w.text()).toContain('newcomer@example.com · not on the guest list')
    expect(w.text()).not.toContain('ada@example.com · not on the guest list')
  })

  it('warns when a group reaches past this event', async () => {
    const w = await mountComposer()
    expect(w.text()).not.toContain('Club-wide blast')
    await clickButton(w, 'Everyone on the roster (5)')
    expect(w.text()).toContain('Club-wide blast')
  })

  it('narrows the list by search without changing who is ticked', async () => {
    const w = await mountComposer()
    search.value = 'hedy'
    await flushPromises()
    expect(w.text()).toContain('Hedy')
    expect(w.text()).not.toContain('ada@example.com')
    expect(w.text()).toContain('Sending to 1 person')
  })

  it('ticks everyone the search shows', async () => {
    const w = await mountComposer()
    search.value = 'ada'
    await flushPromises()
    await clickLabelled(w, 'Select everyone shown')
    expect(selected.value.sort()).toEqual(['ada@example.com', 'grace@example.com'])
  })

  it('says so when a search matches nobody', async () => {
    const w = await mountComposer()
    search.value = 'zzz'
    await flushPromises()
    expect(w.text()).toContain('Nobody matches that search')
  })

  it('will not send with nobody ticked', async () => {
    const w = await mountComposer()
    await clickLabelled(w, 'Send to Grace')
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls).toHaveLength(0)
  })

  it('says so when the event has nobody to email at all', async () => {
    const w = await mountComposer()
    people.value = []
    selected.value = []
    await flushPromises()
    expect(w.text()).toContain('Nobody to email for this event yet')
  })

  it('does not post an empty message', async () => {
    const w = await mountComposer()
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls).toHaveLength(0)
  })

  it('does not post markup with no text (an empty editor emits <p></p>)', async () => {
    const w = await mountComposer()
    await w.find('textarea').setValue('<p></p>')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls).toHaveLength(0)
  })

  it('applying a template fills the message and subject, then sends it', async () => {
    const w = await mountComposer()
    await clickButton(w, 'Vote & bring list reminder')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('<p>Go <strong>vote</strong>!</p>')
    const subjectInput = w.findAll('input').find(i => i.attributes('placeholder') === 'Movie night reminder')
    expect((subjectInput?.element as HTMLInputElement).value).toBe('Vote + bring list')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls[0]?.body).toMatchObject({ message: '<p>Go <strong>vote</strong>!</p>', subject: 'Vote + bring list' })
  })

  it('applying a subject-less template clears a previously typed subject', async () => {
    const w = await mountComposer()
    const subjectInput = w.findAll('input').find(i => i.attributes('placeholder') === 'Movie night reminder')
    await subjectInput?.setValue('My old draft subject')
    await clickButton(w, 'Plain nudge')
    expect((subjectInput?.element as HTMLInputElement).value).toBe('')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('<p>Nudge</p>')
  })

  it('saves the current draft as a named template', async () => {
    const w = await mountComposer()
    await w.find('textarea').setValue('<p>Weekly nudge body</p>')
    await clickButton(w, 'Save as template')
    const nameInput = w.findAll('input').find(i => i.attributes('placeholder') === 'Template name')
    await nameInput?.setValue('Weekly nudge')
    const saveBtn = w.findAll('button').find(b => b.text().trim() === 'Save')
    await saveBtn?.trigger('click')
    await flushPromises()
    expect(saveTemplate).toHaveBeenCalledWith('Weekly nudge', null, '<p>Weekly nudge body</p>')
  })

  it('deletes a template from its pill', async () => {
    const w = await mountComposer()
    const delBtn = w.findAll('button').find(b => b.attributes('aria-label') === 'Delete template Vote & bring list reminder')
    await delBtn?.trigger('click')
    await flushPromises()
    expect(removeTemplate).toHaveBeenCalledWith(templates.value[0])
  })
})
