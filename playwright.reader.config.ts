import {defineConfig} from '@playwright/test';
const base=process.env.TTS_BASE_URL;
export default defineConfig({testDir:'test/reader-e2e',workers:1,timeout:45000,expect:{timeout:10000},use:{baseURL:base||'http://127.0.0.1:8789'},...(base?{}:{webServer:{command:'node scripts/serve-widget-fixture.mjs',url:'http://127.0.0.1:8789/',reuseExistingServer:false}})});
