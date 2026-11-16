import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1, // 4K-avkodning i flera flikar samtidigt gör mätningarna opålitliga
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
    ...devices['Desktop Chrome'],
    viewport: { width: 1100, height: 900 },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    // Facit som testerna sparar hamnar här, inte i samples/.
    env: { FACIT_DIR: '.tmp/e2e-facit' },
  },
});
