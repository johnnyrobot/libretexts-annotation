import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "test/books-browser",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4203",
    headless: true,
    launchOptions: process.env.CI ? {} : { channel: "chrome" },
  },
  webServer: {
    command: "node --experimental-strip-types scripts/serve-library-fixture.ts",
    url: "http://127.0.0.1:4203/social-reading/api/health",
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
