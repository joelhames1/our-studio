import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

// The journeys run against a throwaway local folder with every outside service
// switched off, so they can never touch real data or spend real money. Each of
// these is blanked for the dev server (an empty value beats .env.local).
const OFF = [
  'ERIN_LINK_TOKEN', 'JOEL_LINK_TOKEN', 'SESSION_VERSION',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ERIN_GOOGLE_EMAIL', 'JOEL_GOOGLE_EMAIL',
  'RESEND_API_KEY', 'ALERT_EMAIL', 'ALERT_FROM', 'EMAIL_FROM', 'CRON_SECRET',
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY',
  'ANTHROPIC_API_KEY', 'FAL_KEY', 'OPENAI_API_KEY', 'IMAGE_PROVIDER', 'VERCEL',
];
const prodSmoke = process.env.E2E_PROD === '1';
if (!prodSmoke && process.env.VERCEL) throw new Error('Refusing to run the e2e journeys on Vercel.');

// Use a preinstalled Chromium when one is provided (e.g. CHROME_PATH in CI or cloud sandboxes).
const executablePath = process.env.CHROME_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: prodSmoke ? (process.env.E2E_BASE_URL ?? 'http://localhost:3200') : 'http://localhost:3100',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    // Software WebGL so the 3D try-on renders in headless Chromium.
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] },
    trace: 'retain-on-failure',
  },
  // E2E_PROD=1 runs only the production smoke test, against a `next build && next start`
  // you start yourself (see tests/e2e/prod-smoke.spec.ts).
  ...(prodSmoke
    ? { testMatch: /prod-smoke\.spec\.ts/ }
    : {
        testIgnore: /prod-smoke\.spec\.ts/,
        webServer: {
          // A throwaway data folder, and no link tokens, so the local "who are you?" sign-in is on.
          command: 'rm -rf .data-e2e && npx next dev -p 3100',
          env: { DATA_DIR: '.data-e2e', ...Object.fromEntries(OFF.map((k) => [k, ''])) },
          url: 'http://localhost:3100',
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
});
