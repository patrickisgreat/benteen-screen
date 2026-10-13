import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // Pure tests run in happy-dom; component/composable tests opt into the Nuxt
    // runtime per-file via `// @vitest-environment nuxt`.
    environment: 'happy-dom',
    // Run as a Pacific-time viewer: three hours behind the event zone, which is
    // where event dates used to render a day early. Date math that only works
    // in Eastern fails here.
    env: { TZ: 'America/Los_Angeles' },
    include: ['test/**/*.test.ts'],
    // Agent worktrees live under .claude/worktrees and carry their own copy of
    // the suite + node_modules; running them from here loads two Vue runtimes.
    exclude: ['**/node_modules/**', '**/.claude/**']
  }
})
