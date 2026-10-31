import { defineConfig } from "vite";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createLocalApi } from "./server/local-api.js";
import { ALERTS_FILE, LIVE_FILE, RANCHER_FILE } from "./server/paths.js";

// The /api routes run inside the dev and preview servers too, so sign-in
// works with npm run dev. The full live file in .local/ is sent only to a
// request with a valid rancher session. Nothing in .local/ goes into dist/.
function localApi() {
  const envFile = fileURLToPath(new URL("./.env", import.meta.url));
  if (existsSync(envFile) && typeof process.loadEnvFile === "function") process.loadEnvFile(envFile);
  const handler = createLocalApi({ liveFile: LIVE_FILE, rancherFile: RANCHER_FILE, alertsFile: ALERTS_FILE });
  return {
    name: "fibershare-local-api",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [localApi()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
