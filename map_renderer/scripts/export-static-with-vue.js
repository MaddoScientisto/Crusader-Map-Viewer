import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = process.cwd();
const nodeCommand = process.execPath;
const viteCommand = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");

const viteResult = spawnSync(nodeCommand, [viteCommand, "build", "--config", "vite.config.js"], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env
});

if (viteResult.status !== 0) {
  process.exit(viteResult.status ?? 1);
}

const exportResult = spawnSync(nodeCommand, ["src/export-static.js", ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env
});

process.exit(exportResult.status ?? 0);
