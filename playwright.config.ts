import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "test/browser",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4200",
    headless: true,
    launchOptions: process.env.CI ? {} : { channel: "chrome" },
  },
  webServer: {
    command:
      "DATABASE=.data/e2e.sqlite FIXTURE_SECRETS=.secrets/e2e.json npm run provision && DATABASE=.data/e2e.sqlite PORT=4200 npm start",
    url: "http://127.0.0.1:4200/social-reading/api/health",
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
