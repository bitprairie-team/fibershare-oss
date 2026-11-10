import { defineConfig } from "@playwright/test";

const port = process.env.FIBERSHARE_PORT || "4194";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  webServer: {
    command: `FIBERSHARE_HOST=127.0.0.1 FIBERSHARE_PORT=${port} ./target/debug/fibershare serve`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
  },
  use: { baseURL: `http://127.0.0.1:${port}` },
});
