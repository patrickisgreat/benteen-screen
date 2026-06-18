import { serverSupabaseServiceRole } from '#supabase/server'

/**
 * Deletes the signed-in user's account. Supabase doesn't allow client-side user
 * deletion, so this runs server-side with the service-role key. Removing the
 * auth user cascades to profile → suggestions → votes (FK on delete cascade).
 */
export default defineEventHandler(async (event) => {
  const { userId } = await requireUser(event)

  const admin = serverSupabaseServiceRole(event)
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete account' })
  }

  return { ok: true }
})
