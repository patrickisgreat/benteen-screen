// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref, watch } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventAnnounceComposer from '../app/components/EventAnnounceComposer.vue'
import { fakeApi, type ApiCall } from './utils/fakeApi'

interface AnnounceBody { preview?: boolean, scope?: string, emails?: string[], message?: string, subject?: string, eventId?: string }
const api = fakeApi(['/api/events/announce'], () => ({ ok: true, count: 3 }))
// The audience picker is stubbed below, so every recorded call is a real blast.
const sends = () => api.calls as Array<ApiCall & { body: AnnounceBody }>
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

// The audience picker has its own test; here it's a stub that reports whatever
// count the test wants and exposes a button to switch to a custom audience.
const stubCount = ref<number | null>(3)
const stubRecipients = ref<Array<{ email: string, name: string | null }>>([])
const AnnounceAudiencePickerStub = defineComponent({
  props: { scope: { type: String, required: true }, emails: { type: Array, default: () => [] }, eventId: { type: String, default: undefined } },
  emits: ['update:scope', 'update:emails', 'count', 'recipients'],
  setup(props, { emit }) {
    watch(stubCount, c => emit('count', c), { immediate: true })
    watch(stubRecipients, r => emit('recipients', r), { immediate: true })
    return () => h('div', [
      h('button', {
        'type': 'button',
        'data-testid': 'pick-custom',
        'onClick': () => {
          emit('update:scope', 'custom')
          emit('update:emails', ['ada@x.com'])
        }
      }, props.scope),
      h('button', { 'type': 'button', 'data-testid': 'pick-unopened', 'onClick': () => emit('update:scope', 'unopened') }, 'unopened')
    ])
  }
})

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

const eventObj = {
  id: 'e1', title: 'Jaws on the Green', description: null, event_date: '2026-10-17T04:00:00Z', start_time: null,
  location: null, location_url: null, poster_url: null, voting_locked_at: null, invite_options: null, created_at: ''
}

async function mountComposer() {
  return await mountSuspended(EventAnnounceComposer, {
    // previewDebounceMs: 0 → the preview iframe catches up on the next timer tick.
    props: { eventId: 'e1', event: eventObj, previewDebounceMs: 0 },
    global: { stubs: { RichTextEditor: RichTextEditorStub, AnnounceAudiencePicker: AnnounceAudiencePickerStub } }
  })
}

beforeEach(() => {
  api.reset()
  stubCount.value = 3
  stubRecipients.value = []
  saveTemplate.mockClear()
  removeTemplate.mockClear()
})

describe('EventAnnounceComposer', () => {
  it('posts the announcement for the selected event', async () => {
    const w = await mountComposer()
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(sends()[0]?.url).toBe('/api/events/announce')
    // Defaults to this night's guest list — never the whole club by accident.
    expect(sends()[0]?.body).toMatchObject({ eventId: 'e1', message: 'Doors at 7', scope: 'guests' })
    expect(sends()[0]?.body.emails).toBeUndefined()
  })

  it('does not post an empty message', async () => {
    const w = await mountComposer()
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(sends()).toHaveLength(0)
  })

  it('does not post markup with no text (an empty editor emits <p></p>)', async () => {
    const w = await mountComposer()
    await w.find('textarea').setValue('<p></p>')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(sends()).toHaveLength(0)
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
    expect(sends()[0]?.body).toMatchObject({ message: '<p>Go <strong>vote</strong>!</p>', subject: 'Vote + bring list' })
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

  it('labels the send button with the previewed recipient count', async () => {
    const w = await mountComposer()
    await flushPromises()
    expect(w.findAll('button').some(b => b.text().includes('Send to 3'))).toBe(true)
  })

  it('refuses to send to an empty audience', async () => {
    stubCount.value = 0
    const w = await mountComposer()
    await flushPromises()
    const send = w.findAll('button').find(b => b.text().includes('Send blast'))
    expect(send?.attributes('disabled')).toBeDefined()
  })

  it('does not allow sending before the audience preview has resolved', async () => {
    stubCount.value = null
    const w = await mountComposer()
    await flushPromises()
    const send = w.findAll('button').find(b => b.text().includes('Send blast'))
    expect(send?.attributes('disabled')).toBeDefined()
  })

  it('sends the hand-picked emails with a custom audience', async () => {
    const w = await mountComposer()
    await w.get('[data-testid="pick-custom"]').trigger('click')
    await w.find('textarea').setValue('Just you two')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(sends()[0]?.body).toMatchObject({ scope: 'custom', emails: ['ada@x.com'], message: 'Just you two' })
  })

  describe('live preview', () => {
    const previewHtml = (w: Awaited<ReturnType<typeof mountComposer>>): string =>
      w.get('[data-testid="email-preview"] iframe').attributes('srcdoc') ?? ''

    it('shows nothing until there is a message to preview', async () => {
      const w = await mountComposer()
      expect(w.find('[data-testid="email-preview"]').exists()).toBe(false)
    })

    it('renders the email as it will be sent: event heading, message, and the app button', async () => {
      const w = await mountComposer()
      await w.find('textarea').setValue('<p>Doors at <strong>7</strong></p>')
      await vi.waitFor(() => expect(previewHtml(w)).toContain('Doors at <strong>7</strong>'))
      expect(previewHtml(w)).toContain('Jaws on the Green')
      expect(previewHtml(w)).toContain('View on Benteen Screen')
    })

    it('greets a real recipient from the chosen audience by first name and says whose copy it is', async () => {
      stubRecipients.value = [{ email: 'anon@x.com', name: null }, { email: 'sam@x.com', name: 'Sam Jones' }]
      const w = await mountComposer()
      await w.find('textarea').setValue('Doors at 7')
      await vi.waitFor(() => expect(previewHtml(w)).toContain('Hi Sam,'))
      expect(w.get('[data-testid="email-preview"]').text()).toContain('This is Sam\'s copy')
    })

    it('shows no greeting when nobody in the audience has a name', async () => {
      stubRecipients.value = [{ email: 'anon@x.com', name: null }]
      const w = await mountComposer()
      await w.find('textarea').setValue('Doors at 7')
      await vi.waitFor(() => expect(previewHtml(w)).toContain('Doors at 7'))
      expect(previewHtml(w)).not.toContain('Hi ')
      expect(w.get('[data-testid="email-preview"]').text()).toContain('when we know it')
    })

    it('shows the subject the email will carry, defaulting when left blank', async () => {
      const w = await mountComposer()
      await w.find('textarea').setValue('Doors at 7')
      expect(w.get('[data-testid="email-preview"]').text()).toContain('Subject: Jaws on the Green — Benteen Screen On The Green')
      await w.find('input').setValue('Did my invite reach you?')
      expect(w.get('[data-testid="email-preview"]').text()).toContain('Subject: Did my invite reach you?')
    })

    it('shows the RSVP buttons when writing to people who haven\'t opened the e-vite', async () => {
      const w = await mountComposer()
      await w.find('textarea').setValue('Did this reach you?')
      await w.get('[data-testid="pick-unopened"]').trigger('click')
      await vi.waitFor(() => expect(previewHtml(w)).toContain('status=going'))
      expect(previewHtml(w)).toContain('Maybe')
      expect(previewHtml(w)).not.toContain('View on Benteen Screen')
      expect(w.get('[data-testid="email-preview"]').text()).toContain('RSVP buttons')
    })

    it('never lets a script in the message reach the preview', async () => {
      const w = await mountComposer()
      await w.find('textarea').setValue('<p>Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>')
      await vi.waitFor(() => expect(previewHtml(w)).toContain('<p>Hi</p>'))
      expect(previewHtml(w)).not.toContain('<script>')
      expect(previewHtml(w)).not.toContain('<img')
      expect(w.get('[data-testid="email-preview"] iframe').attributes('sandbox')).toBe('')
    })
  })
})
