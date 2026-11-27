import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices, type ReporterDescription } from "@playwright/test";

// Tests run against the production build in .next/ served by `next start` — run `npm run build` first
// (or use `npm run test:e2e`, which does). The sign-in settings get fresh random values per run so that no
// value is ever committed; workers inherit the main process's values.
const PORT = 3100;

if (process.env.TEST_WORKER_INDEX === undefined) {
  process.env.AUTH_SECRET = randomBytes(32).toString("base64");
  process.env.AUTH_GOOGLE_ID = `${randomBytes(8).toString("hex")}.apps.example.test`;
  process.env.AUTH_GOOGLE_SECRET = randomBytes(12).toString("hex");
  process.env.ADMIN_EMAIL = `owner-${randomBytes(4).toString("hex")}@example.test`;
  process.env.SUPABASE_DB_URL = `stand-in:${path.join(os.tmpdir(), "portfolio-standin-" + randomBytes(6).toString("hex") + ".json")}`;
  process.env.SUPABASE_URL = `stand-in:${path.join(os.tmpdir(), "portfolio-standin-storage-" + randomBytes(6).toString("hex"))}`;
}

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
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
