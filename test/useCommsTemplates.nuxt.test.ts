// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'

const calls = {
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ payload: Record<string, unknown>, filters: Record<string, unknown> }>,
  deletes: [] as Array<Record<string, unknown>>
}
const rows = [
  { id: 't1', name: 'Vote & bring list reminder', subject: 'Reminder!', body: '<p>Vote</p>' }
]

const supabase = {
  from() {
    return {
      select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
      insert: (payload: Record<string, unknown>) => {
        calls.inserts.push(payload)
        return Promise.resolve({ error: null })
      },
      update: (payload: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => {
          calls.updates.push({ payload, filters: { [col]: val } })
          return Promise.resolve({ error: null })
        }
      }),
      delete: () => ({
        eq: (col: string, val: unknown) => {
          calls.deletes.push({ [col]: val })
          return Promise.resolve({ error: null })
        }
      })
    }
  }
}

mockNuxtImport('useSupabaseClient', () => () => supabase)

beforeEach(() => {
  calls.inserts = []
  calls.updates = []
  calls.deletes = []
})

describe('useCommsTemplates', () => {
  it('loads templates ordered by name', async () => {
    const { templates } = useCommsTemplates()
    await flushPromises()
    expect(templates.value).toEqual(rows)
  })

  it('saveTemplate inserts trimmed name/subject and omits created_by (DB defaults it)', async () => {
    const { saveTemplate } = useCommsTemplates()
    await saveTemplate('  Weekly nudge ', '  Hello  ', '<p>hi</p>')
    expect(calls.inserts).toHaveLength(1)
    expect(calls.inserts[0]).toEqual({ name: 'Weekly nudge', subject: 'Hello', body: '<p>hi</p>' })
    expect(calls.inserts[0]).not.toHaveProperty('created_by')
  })

  it('saveTemplate stores a null subject when blank', async () => {
    const { saveTemplate } = useCommsTemplates()
    await saveTemplate('Nudge', '   ', '<p>hi</p>')
    expect(calls.inserts[0]).toMatchObject({ subject: null })
  })

  it('saveTemplate refuses a blank name or body', async () => {
    const { saveTemplate } = useCommsTemplates()
    await saveTemplate('   ', null, '<p>hi</p>')
    await saveTemplate('Nudge', null, '  ')
    // Markup with no text (an empty editor emits <p></p>) is still blank.
    await saveTemplate('Nudge', null, '<p></p>')
    expect(calls.inserts).toHaveLength(0)
  })

  it('updateTemplate updates the row by id with trimmed fields', async () => {
    const { updateTemplate } = useCommsTemplates()
    const template = { id: 't1', name: 'Old', subject: null, body: '<p>old</p>' }
    await updateTemplate(template, { name: ' New name ', subject: '  ', body: '<p>new</p>' })
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0]).toEqual({
      payload: { name: 'New name', subject: null, body: '<p>new</p>' },
      filters: { id: 't1' }
    })
  })

  it('updateTemplate refuses a blank name or blank-markup body', async () => {
    const { updateTemplate } = useCommsTemplates()
    const template = { id: 't1', name: 'Old', subject: null, body: '<p>old</p>' }
    await updateTemplate(template, { name: '  ', subject: null, body: '<p>new</p>' })
    await updateTemplate(template, { name: 'New', subject: null, body: '<p></p>' })
    expect(calls.updates).toHaveLength(0)
  })

  it('removeTemplate deletes by id', async () => {
    const { removeTemplate } = useCommsTemplates()
    await removeTemplate({ id: 't1', name: 'x', subject: null, body: 'b' })
    expect(calls.deletes[0]).toEqual({ id: 't1' })
  })
})
