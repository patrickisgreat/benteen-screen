/** Member-facing invite actions. The server route adds the email to the
 *  allowlist (RLS + cap enforced there) and sends the e-vite via Resend. */
export function useInvites() {
  async function sendInvite(email: string, name?: string): Promise<{ ok: boolean, emailed: boolean }> {
    return await $fetch('/api/invites/send', {
      method: 'POST',
      body: { email, name }
    })
  }

  return { sendInvite }
}
