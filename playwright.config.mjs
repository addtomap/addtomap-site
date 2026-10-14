// End-to-end tests for addtomap.co, run against the repo served as static files.
// Google Chrome (channel "chrome") rather than Playwright's Chromium: the hero loops and tour
// previews are H.264 / MP3, which the open-source Chromium build cannot decode.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  workers: process.env.CI ? 2 : 4,   // the static server streams ~1–2 MB videos; more parallel pages only add timeouts
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // the site plays muted video and, on click, audio; no sound card in CI and none wanted locally
    launchOptions: { args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
