import { defineConfig, devices } from '@playwright/test';

// Escape hatch for environments where the matching Chromium build cannot be
// downloaded (for example a sandbox with a pre-cached older revision).
// Unset in CI and local dev, so default browser resolution applies.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      // Specs assert the deterministic offline provider; never let a test run
      // hit the live model API.
      KODA_AI_MOCK: '1',
      // Same rule for integrations: deterministic mock adapters, mock OAuth.
      KODA_INTEGRATIONS_MOCK: '1',
      // Test-only encryption key so the token vault path is fully exercised.
      // Not a secret: it protects nothing outside a local test database.
      KODA_TOKEN_ENC_KEY:
        process.env.KODA_TOKEN_ENC_KEY ?? 'VGhpc0lzQTMyQnl0ZVRlc3RPbmx5S2V5Rm9yS29kYSE=',
    },
  },
});
