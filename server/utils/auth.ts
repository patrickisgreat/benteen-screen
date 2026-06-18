import { serverSupabaseUser } from '#supabase/server'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import { claimsUserId } from './userId'

// Shared server-route guards. `serverSupabaseUser` returns decoded JWT *claims*
// (see userId.ts), so the user id is `sub` — read it via `claimsUserId`.

type AuthUser = NonNullable<Awaited<ReturnType<typeof serverSupabaseUser>>>

/**
 * Resolves the signed-in user, throwing a 401 when there is no valid session.
 * Returns both the claims and the non-null user id so callers skip the
 * `!user || !userId` dance.
 */
export async function requireUser(event: H3Event): Promise<{ user: AuthUser, userId: string }> {
  const user = await serverSupabaseUser(event)
  const userId = claimsUserId(user)
  if (!user || !userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  return { user, userId }
}

/**
 * Asserts the user is an admin, using their own RLS-scoped client. Surfaces the
 * profile lookup error as a 500 (rather than silently treating it as "not
 * admin"), then throws 403 if they aren't an admin.
 */
export async function requireAdmin(db: SupabaseClient<Database>, userId: string): Promise<void> {
  const { data: me, error } = await db.from('profiles').select('is_admin').eq('id', userId).single()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load your profile', data: { cause: error.message, code: error.code } })
  }
  if (!me?.is_admin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })
}
