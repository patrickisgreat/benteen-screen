// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PeopleList from '../app/components/PeopleList.vue'

const people = [
  { id: 'u1', email: 'alice@x.com', display_name: 'Alice', avatar_url: null, is_admin: false, blocked: false, created_at: '' },
  { id: 'u2', email: 'bob@x.com', display_name: 'Bob', avatar_url: null, is_admin: false, blocked: true, created_at: '' },
  { id: 'u3', email: 'carol@x.com', display_name: 'Carol', avatar_url: null, is_admin: true, blocked: false, created_at: '' }
]

describe('PeopleList', () => {
  it('lists every member', async () => {
    const w = await mountSuspended(PeopleList, { props: { people } })
    expect(w.text()).toContain('Alice')
    expect(w.text()).toContain('Bob')
    expect(w.text()).toContain('Carol')
  })

  it('emits block when banning a normal member', async () => {
    const w = await mountSuspended(PeopleList, { props: { people } })
    const banBtn = w.findAll('button').find(b => b.text().trim() === 'Ban')
    await banBtn?.trigger('click')
    expect(w.emitted('block')?.[0]).toEqual([people[0]])
  })

  it('emits unblock when unbanning a blocked member', async () => {
    const w = await mountSuspended(PeopleList, { props: { people } })
    const unbanBtn = w.findAll('button').find(b => b.text().trim() === 'Unban')
    await unbanBtn?.trigger('click')
    expect(w.emitted('unblock')?.[0]).toEqual([people[1]])
  })

  it('offers no ban control for admins', async () => {
    const w = await mountSuspended(PeopleList, { props: { people } })
    // Only Alice (normal, unblocked) is bannable; Carol (admin) has no Ban button.
    expect(w.findAll('button').filter(b => b.text().trim() === 'Ban')).toHaveLength(1)
  })

  it('filters by the search query', async () => {
    const w = await mountSuspended(PeopleList, { props: { people } })
    await w.find('input').setValue('bob')
    expect(w.text()).toContain('Bob')
    expect(w.text()).not.toContain('Alice')
  })
})
