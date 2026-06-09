import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.ADMIN_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  // In CI the servers are started by the workflow; locally start them here.
  webServer: process.env.CI
    ? undefined
    : [
        {
          command: 'bun run --cwd ../server dev',
          url: 'http://localhost:3000/health',
          reuseExistingServer: true,
        },
        {
          command: 'bun run --cwd ../client/admin dev',
          url: 'http://localhost:5173',
          reuseExistingServer: true,
        },
        {
          command: 'bun run --cwd ../client/customer dev',
          url: 'http://localhost:5174',
          reuseExistingServer: true,
        },
      ],
})
