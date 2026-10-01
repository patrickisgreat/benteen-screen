import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { getQuery, readBody } from 'h3'

/** One request the app made to a faked API route. */
export interface ApiCall {
  url: string
  method: string
  /** Parsed JSON body (undefined for GET). */
  body: unknown
  query: Record<string, unknown>
}

export interface FakeApi {
  /** Every request so far, oldest first. */
  calls: ApiCall[]
  /** Forget recorded calls (call in beforeEach). */
  reset: () => void
}

/**
 * Stand in for the app's `/api/*` routes inside the `nuxt` vitest environment.
 *
 * Nuxt binds the auto-imported `$fetch` when the app boots, so stubbing the
 * global afterwards (`vi.stubGlobal('$fetch', …)`) no longer intercepts calls
 * made from components and composables. Registering endpoints does, on every
 * Nuxt version: real requests are routed to these handlers. Each call is
 * recorded and answered with `respond(call)`; throw there (e.g. `createError`)
 * to make the request fail.
 */
export function fakeApi(paths: readonly string[], respond: (call: ApiCall) => unknown): FakeApi {
  const calls: ApiCall[] = []
  for (const path of paths) {
    registerEndpoint(path, async (event) => {
      const call: ApiCall = {
        url: path,
        method: event.method,
        body: event.method === 'GET' || event.method === 'HEAD' ? undefined : await readBody(event),
        query: getQuery(event)
      }
      calls.push(call)
      return respond(call)
    })
  }
  return { calls, reset: () => calls.splice(0) }
}
