// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import InviteFriendModal from '../app/components/InviteFriendModal.vue'

const calls: Array<{ email: string, name?: string }> = []
mockNuxtImport('useInvites', () => () => ({
  sendInvite: async (email: string, name?: string) => {
    calls.push({ email, name })
    return { ok: true, emailed: true }
  }
}))
mockNuxtImport('useToast', () => () => ({ add: () => {} }))

// UModal teleports its body to <body>; query the document, not the wrapper.
function emailInput(): HTMLInputElement | null {
  return document.querySelector('input[type="email"]')
}
function form(): HTMLFormElement | null {
  return document.querySelector('form')
}

beforeEach(() => {
  calls.length = 0
  document.body.innerHTML = ''
})

describe('InviteFriendModal', () => {
  it('sends the invite on submit', async () => {
    await mountSuspended(InviteFriendModal, { props: { open: true } })
    await flushPromises()
    const input = emailInput()
    expect(input).not.toBeNull()
    input!.value = 'friend@x.com'
    input!.dispatchEvent(new Event('input'))
    await flushPromises()
    form()!.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(calls[0]?.email).toBe('friend@x.com')
  })

  it('does not send for an invalid email', async () => {
    await mountSuspended(InviteFriendModal, { props: { open: true } })
    await flushPromises()
    const input = emailInput()
    input!.value = 'nope'
    input!.dispatchEvent(new Event('input'))
    await flushPromises()
    form()!.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(calls).toHaveLength(0)
  })
})
