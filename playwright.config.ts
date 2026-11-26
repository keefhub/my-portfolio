import { defineConfig, devices, type ReporterDescription } from "@playwright/test";

// Tests run against the real static export in out/ — run `npm run build` first
// (or use `npm run test:e2e`, which does). http-server mirrors Firebase Hosting:
// exact-match files with trailing-slash directory indexes, no SPA fallback.
const PORT = 3100;

// `npm run verify` sets VERIFY_PLAYWRIGHT_JSON so it can read the result as data; the console report still goes
// to its log. Every other run keeps the list reporter.
const jsonReport = process.env.VERIFY_PLAYWRIGHT_JSON;
const reporter: ReporterDescription[] = jsonReport ? [["list"], ["json", { outputFile: jsonReport }]] : [["list"]];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `npx http-server out -p ${PORT} -a 127.0.0.1 -c-1 -s`,
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx firebase emulators:start --only auth,firestore --project thegoldenpothos-5b3a1 --non-interactive",
      url: "http://127.0.0.1:8080/",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      stdout: "ignore",
      // SIGKILL (the default) kills the CLI but orphans the Java Firestore emulator, which then keeps port 8080
      // answering while Auth (9099) is gone. SIGTERM lets the CLI stop both emulators.
      gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
    },
  ],
});
