import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const targetScript = process.argv[2];
if (!targetScript) {
  console.error("Usage: node scripts/run-with-vue-build.js <server-script>");
  process.exit(1);
}

const rootDir = process.cwd();
const distIndexFile = path.join(rootDir, "dist-vue", "index.html");
const nodeCommand = process.execPath;
const viteCommand = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
let buildProcess = null;
let serverProcess = null;
let serverStarted = false;
let shuttingDown = false;

function startServer() {
  if (serverStarted || shuttingDown) {
    return;
  }
  serverStarted = true;
  serverProcess = spawn(nodeCommand, ["--watch", targetScript], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });

  serverProcess.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (buildProcess && !buildProcess.killed) {
      buildProcess.kill();
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
}

function stopChildren(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  if (buildProcess && !buildProcess.killed) {
    buildProcess.kill();
  }
  process.exit(exitCode);
}

process.on("SIGINT", () => stopChildren(130));
process.on("SIGTERM", () => stopChildren(143));

buildProcess = spawn(nodeCommand, [viteCommand, "build", "--watch", "--config", "vite.config.js"], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env
});

buildProcess.on("exit", (code, signal) => {
  if (shuttingDown) {
    return;
  }
  if (!serverStarted) {
    stopChildren(code ?? (signal ? 1 : 0));
    return;
  }
});

const waitForInitialBundle = () => {
  if (fs.existsSync(distIndexFile)) {
    startServer();
    return;
  }
  setTimeout(waitForInitialBundle, 250);
};

waitForInitialBundle();