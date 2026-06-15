import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

/**
 * Deletes the signed-in user's account. Supabase doesn't allow client-side user
 * deletion, so this runs server-side with the service-role key. Removing the
 * auth user cascades to profile → suggestions → votes (FK on delete cascade).
 */
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const admin = serverSupabaseServiceRole(event)
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete account' })
  }

  return { ok: true }
})
