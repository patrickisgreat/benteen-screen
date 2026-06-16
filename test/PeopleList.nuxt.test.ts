// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PeopleList from '../app/components/PeopleList.vue'

const people = [
  { id: 'u1', email: 'alice@x.com', display_name: 'Alice', avatar_url: null, is_admin: false, blocked: false, created_at: '' },
  { id: 'u2', email: 'bob@x.com', display_name: 'Bob', avatar_url: null, is_admin: false, blocked: true, created_at: '' },
  { id: 'u3', email: 'carol@x.com', display_name: 'Carol', avatar_url: null, is_admin: true, blocked: false, created_at: '' }
]

const pending = [
  { email: 'pat@x.com', invited_by: null, display_name: 'Pat', created_at: '', accepted_at: null }
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

  it('lists pending invites with a Revoke action', async () => {
    const w = await mountSuspended(PeopleList, { props: { people, pending } })
    expect(w.text()).toContain('Pat')
    expect(w.text()).toContain('Pending')
    expect(w.findAll('button').some(b => b.text().trim() === 'Revoke')).toBe(true)
  })

  it('emits revoke with the pending invite', async () => {
    const w = await mountSuspended(PeopleList, { props: { people, pending } })
    const revoke = w.findAll('button').find(b => b.text().trim() === 'Revoke')
    await revoke?.trigger('click')
    expect(w.emitted('revoke')?.[0]).toEqual([pending[0]])
  })

  it('searches across pending invites too', async () => {
    const w = await mountSuspended(PeopleList, { props: { people, pending } })
    await w.find('input').setValue('pat')
    expect(w.text()).toContain('Pat')
    expect(w.text()).not.toContain('Alice')
  })

  it('hides a pending invite that already belongs to a member', async () => {
    const dupe = [{ email: 'alice@x.com', invited_by: null, display_name: 'Alice Dupe', created_at: '', accepted_at: null }]
    const w = await mountSuspended(PeopleList, { props: { people, pending: dupe } })
    expect(w.text()).not.toContain('Alice Dupe')
  })

  it('emits select with the member when their row is clicked', async () => {
    const w = await mountSuspended(PeopleList, { props: { people } })
    await w.get('[aria-label="View Alice\'s activity"]').trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([people[0]])
  })

  it('does not make pending invites clickable for stats', async () => {
    const w = await mountSuspended(PeopleList, { props: { people, pending } })
    expect(w.find('[aria-label="View Pat\'s activity"]').exists()).toBe(false)
  })
})
