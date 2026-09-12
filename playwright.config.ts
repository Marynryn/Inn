import { defineConfig, devices } from '@playwright/test'

/*
  Виртуальный тестировщик. Сервер поднимается сам, на своём порту и в своей
  папке хранилища (.data/e2e): боевая база и .env не трогаются. Каждый запуск
  начинается с пустой базы — миграция заводит admin@tavern.local, а посев
  (global-setup) добавляет читателя и главу.
*/
export const E2E_PORT = 3100
export const E2E_URL = `http://localhost:${E2E_PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  // База одна на всех: тесты идут по очереди, чтобы счётчики и списки
  // комментариев не плыли от соседей.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.data/e2e-report' }]],
  outputDir: '.data/e2e-results',
  use: {
    baseURL: E2E_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Сервер считает «headless» в user-agent ботом и не засчитывает просмотры.
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 E2E',
    locale: 'ru-RU',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile.spec.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: 'node tests/e2e/serve.mjs',
    url: `${E2E_URL}/api/settings`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
