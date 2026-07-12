// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
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

async function mountComposer() {
  return await mountSuspended(EventAnnounceComposer, {
    props: { eventId: 'e1' },
    global: { stubs: { RichTextEditor: RichTextEditorStub } }
  })
}

beforeEach(() => {
  calls.length = 0
  saveTemplate.mockClear()
  removeTemplate.mockClear()
  vi.stubGlobal('$fetch', (url: string, opts: { body: unknown }) => {
    calls.push({ url, body: opts.body })
    return Promise.resolve({ ok: true, count: 3 })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('EventAnnounceComposer', () => {
  it('posts the announcement for the selected event', async () => {
    const w = await mountComposer()
    await w.find('textarea').setValue('Doors at 7')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(calls[0]?.url).toBe('/api/events/announce')
    expect(calls[0]?.body).toMatchObject({ eventId: 'e1', message: 'Doors at 7', scope: 'members' })
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
