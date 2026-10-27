import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const roots = ["src", "functions"];

function javascriptFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      files.push(...javascriptFiles(path));
    } else if (name.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

const files = roots.flatMap((root) => javascriptFiles(root));
if (files.length === 0) {
  console.error("lint: no JavaScript files found");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (result.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`lint: ${failed} file(s) failed syntax check`);
  process.exit(1);
}

console.log(`lint: syntax ok (${files.length} files)`);
