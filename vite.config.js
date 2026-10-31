import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// .local/live.json is written by `npm run chirpstack:pull`. git ignores it, and
// it is never copied into dist/. The dev and preview servers answer
// /live/live.json from it so the herd view can show live data on your own
// hardware. Without the file they answer 204 with no body and the page uses sample data.
const LIVE_FILE = fileURLToPath(new URL("./.local/live.json", import.meta.url));

function liveFile() {
  const handler = async (req, res, next) => {
    if (!req.url || req.url.split("?")[0] !== "/live/live.json") return next();
    res.setHeader("Cache-Control", "no-store");
    try {
      const text = await readFile(LIVE_FILE, "utf8");
      JSON.parse(text);
      res.setHeader("Content-Type", "application/json");
      res.end(text);
    } catch {
      res.statusCode = 204;
      res.end();
    }
  };
  return {
    name: "fibershare-live-file",
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
  plugins: [liveFile()],
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
