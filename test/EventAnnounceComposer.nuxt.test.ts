// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventAnnounceComposer from '../app/components/EventAnnounceComposer.vue'

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

// Resolving the audience is the composable's job (covered in its own spec); here
// it's a stand-in that records the scope it was asked for, so these tests can
// assert what the composer requests and what it finally sends.
const requestedScopes: string[] = []
const recipients = ref([
  { email: 'ada@example.com', name: 'Ada' },
  { email: 'grace@example.com', name: 'Grace' }
])
const selected = ref<string[]>([])
mockNuxtImport('useAnnounceRecipients', () => (_eventId: unknown, scope: unknown) => {
  requestedScopes.push(String(typeof scope === 'function' ? scope() : scope))
  return {
    recipients,
    selected,
    pending: ref(false),
    error: ref(null),
    allSelected: computed(() => selected.value.length === recipients.value.length),
    toggle: (email: string) => {
      selected.value = selected.value.includes(email)
        ? selected.value.filter(e => e !== email)
        : [...selected.value, email]
    },
    toggleAll: (on: boolean) => {
      selected.value = on ? recipients.value.map(r => r.email) : []
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

/** Click a checkbox by its aria-label (Nuxt UI renders its own control, so a
 *  click is the honest interaction — setValue on the input never reaches it). */
async function clickCheckbox(w: Awaited<ReturnType<typeof mountComposer>>, label: string): Promise<void> {
  await w.get(`[aria-label="${label}"]`).trigger('click')
}

beforeEach(() => {
  calls.length = 0
  requestedScopes.length = 0
  recipients.value = [
    { email: 'ada@example.com', name: 'Ada' },
    { email: 'grace@example.com', name: 'Grace' }
  ]
  selected.value = recipients.value.map(r => r.email)
  saveTemplate.mockClear()
  removeTemplate.mockClear()
  vi.stubGlobal('$fetch', (url: string, opts: { body: unknown }) => {
    calls.push({ url, body: opts.body })
    return Promise.resolve({ ok: true, count: 2 })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('EventAnnounceComposer', () => {
  it('defaults to this event\'s guest list, not the whole club', async () => {
    const w = await mountComposer()
    expect(requestedScopes[0]).toBe('guests')
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls[0]?.body).toMatchObject({ scope: 'guests' })
  })

  it('posts the announcement for the selected event', async () => {
    const w = await mountComposer()
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls[0]?.url).toBe('/api/events/announce')
    expect(calls[0]?.body).toMatchObject({ eventId: 'e1', message: 'Doors at 7' })
  })

  it('sends to exactly the people still ticked', async () => {
    const w = await mountComposer()
    await clickCheckbox(w, 'Send to Ada')
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls[0]?.body).toMatchObject({ recipients: ['grace@example.com'] })
  })

  it('shows how many of the audience the blast will reach', async () => {
    const w = await mountComposer()
    expect(w.text()).toContain('Sending to 2 of 2')
    await clickCheckbox(w, 'Send to Ada')
    expect(w.text()).toContain('Sending to 1 of 2')
    expect(w.text()).toContain('Send to 1')
  })

  it('names every recipient so the audience is never a mystery', async () => {
    const w = await mountComposer()
    expect(w.text()).toContain('Ada')
    expect(w.text()).toContain('ada@example.com')
    expect(w.text()).toContain('Grace')
  })

  it('will not send with nobody ticked', async () => {
    const w = await mountComposer()
    await clickCheckbox(w, 'Select all recipients')
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls).toHaveLength(0)
  })

  it('says so when no one matches the audience', async () => {
    const w = await mountComposer()
    recipients.value = []
    selected.value = []
    await flushPromises()
    expect(w.text()).toContain('Nobody matches this audience')
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
    const pill = w.findAll('button').find(b => b.text().includes('Vote & bring list reminder'))
    await pill?.trigger('click')
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
    const pill = w.findAll('button').find(b => b.text().includes('Plain nudge'))
    await pill?.trigger('click')
    expect((subjectInput?.element as HTMLInputElement).value).toBe('')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('<p>Nudge</p>')
  })

  it('saves the current draft as a named template', async () => {
    const w = await mountComposer()
    await w.find('textarea').setValue('<p>Weekly nudge body</p>')
    const openBtn = w.findAll('button').find(b => b.text().includes('Save as template'))
    await openBtn?.trigger('click')
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
