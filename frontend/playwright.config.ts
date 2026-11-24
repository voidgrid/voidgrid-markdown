import { defineConfig } from "@playwright/test";

// BASE_URL points at the running voidgrid-markdown container (scripts/e2e.sh sets it).
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env["BASE_URL"] ?? "http://127.0.0.1:8793",
    acceptDownloads: true,
    browserName: "chromium",
  },
});
