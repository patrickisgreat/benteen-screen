// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import BringList from '../app/components/BringList.vue'

mockNuxtImport('useAuth', () => () => ({ myId: ref('me'), isAdmin: ref(false) }))

const items = [
  { id: 'b1', event_id: 'e1', label: 'Chips', note: null, user_id: null, created_by: 'x', bringer: null },
  { id: 'b2', event_id: 'e1', label: 'Drinks', note: null, user_id: 'me', created_by: 'me', bringer: { display_name: 'Me' } }
]

describe('BringList (public claim view)', () => {
  it('shows the pizza-dough count and every item label', async () => {
    const w = await mountSuspended(BringList, { props: { items, doughs: 2 } })
    expect(w.text()).toContain('2 pizza doughs needed')
    expect(w.text()).toContain('Chips')
    expect(w.text()).toContain('Drinks')
  })

  it('emits claim for an open item', async () => {
    const w = await mountSuspended(BringList, { props: { items, doughs: 2 } })
    const claimBtn = w.findAll('button').find(b => b.text().includes('I\'ll bring it'))
    await claimBtn?.trigger('click')
    expect(w.emitted('claim')?.[0]).toEqual([items[0]])
  })

  it('emits unclaim for an item I already own', async () => {
    const w = await mountSuspended(BringList, { props: { items, doughs: 2 } })
    const unclaimBtn = w.findAll('button').find(b => b.text().includes('Unclaim'))
    await unclaimBtn?.trigger('click')
    expect(w.emitted('unclaim')?.[0]).toEqual([items[1]])
  })

  it('has no add input — the list is admin-curated', async () => {
    const w = await mountSuspended(BringList, { props: { items, doughs: 2 } })
    expect(w.find('input').exists()).toBe(false)
  })
})

describe('BringList (admin manage view)', () => {
  it('emits add for a newly typed item', async () => {
    const w = await mountSuspended(BringList, { props: { items, doughs: 2, manage: true } })
    await w.find('input').setValue('Blanket')
    const addBtn = w.findAll('button').find(b => b.text().trim() === 'Add')
    await addBtn?.trigger('click')
    expect(w.emitted('add')?.[0]).toEqual(['Blanket'])
  })

  it('emits remove for an item', async () => {
    const w = await mountSuspended(BringList, { props: { items, doughs: 2, manage: true } })
    const removeBtn = w.findAll('button').find(b => b.attributes('aria-label') === 'Remove item')
    await removeBtn?.trigger('click')
    expect(w.emitted('remove')?.[0]).toEqual([items[0]])
  })

  it('shows no claim buttons in manage mode', async () => {
    const w = await mountSuspended(BringList, { props: { items, doughs: 2, manage: true } })
    expect(w.findAll('button').some(b => b.text().includes('I\'ll bring it'))).toBe(false)
  })
})
