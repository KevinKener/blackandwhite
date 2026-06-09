import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['integration/**/*.test.ts'],
    // Tests run sequentially — each file gets a clean DB state via beforeAll.
    // Parallel runs would race on shared Supabase local state.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
  },
})
