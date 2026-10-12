// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import EditPersonModal from '../app/components/EditPersonModal.vue'
import type { PersonDetails } from '../shared/types/user'

const member: PersonDetails = { email: 'ada@x.com', profileId: 'u1', displayName: 'Ada', phone: '+15551234567' }
const pending: PersonDetails = { email: 'pat@x.com', profileId: null, displayName: null, phone: null }

// UModal teleports to <body>; find controls there.
const byLabel = (label: string) => document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!
const buttonNamed = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text)!

function setInput(el: HTMLInputElement, value: string): void {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('EditPersonModal', () => {
  it('prefills the name, a readable number, and the read-only email', async () => {
    await mountSuspended(EditPersonModal, { props: { open: true, person: member } })
    await flushPromises()
    expect(document.body.textContent).toContain('Edit Ada')
    expect(byLabel('Name').value).toBe('Ada')
    expect(byLabel('Mobile number').value).toBe('(555) 123-4567')
    expect(byLabel('Email').value).toBe('ada@x.com')
    expect(byLabel('Email').disabled).toBe(true)
  })

  it('emits save with the trimmed name and the number normalized to E.164', async () => {
    const w = await mountSuspended(EditPersonModal, { props: { open: true, person: member } })
    await flushPromises()
    setInput(byLabel('Name'), '  Ada Lovelace ')
    setInput(byLabel('Mobile number'), '555.987.6543')
    await flushPromises()
    buttonNamed('Save').click()
    await flushPromises()
    expect(w.emitted('save')?.[0]).toEqual([{ email: 'ada@x.com', profileId: 'u1', displayName: 'Ada Lovelace', phone: '+15559876543' }])
  })

  it('an emptied number saves as null', async () => {
    const w = await mountSuspended(EditPersonModal, { props: { open: true, person: member } })
    await flushPromises()
    setInput(byLabel('Mobile number'), '')
    await flushPromises()
    buttonNamed('Save').click()
    await flushPromises()
    expect(w.emitted('save')?.[0]?.[0]).toMatchObject({ phone: null })
  })

  it('blocks saving an invalid number and says why', async () => {
    await mountSuspended(EditPersonModal, { props: { open: true, person: member } })
    await flushPromises()
    setInput(byLabel('Mobile number'), '12345')
    await flushPromises()
    expect(document.body.textContent).toContain('Not a valid number')
    expect(buttonNamed('Save').disabled).toBe(true)
  })

  it('a member must keep a name; a roster entry may be a bare email', async () => {
    await mountSuspended(EditPersonModal, { props: { open: true, person: member } })
    await flushPromises()
    setInput(byLabel('Name'), '')
    await flushPromises()
    expect(document.body.textContent).toContain('A member needs a name')
    expect(buttonNamed('Save').disabled).toBe(true)
    document.body.innerHTML = ''

    const w = await mountSuspended(EditPersonModal, { props: { open: true, person: pending } })
    await flushPromises()
    expect(document.body.textContent).toContain('On the roster')
    expect(buttonNamed('Save').disabled).toBe(false)
    buttonNamed('Save').click()
    await flushPromises()
    expect(w.emitted('save')?.[0]).toEqual([{ email: 'pat@x.com', profileId: null, displayName: null, phone: null }])
  })
})
