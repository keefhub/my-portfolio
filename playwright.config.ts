import { defineConfig, devices } from "@playwright/test";

// Tests run against the real static export in out/ — run `npm run build` first
// (or use `npm run test:e2e`, which does). http-server mirrors Firebase Hosting:
// exact-match files with trailing-slash directory indexes, no SPA fallback.
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx http-server out -p ${PORT} -a 127.0.0.1 -c-1 -s`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
