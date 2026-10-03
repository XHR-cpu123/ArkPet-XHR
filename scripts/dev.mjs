import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const root = process.cwd();
const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const electronBin = require("electron");
const url = "http://127.0.0.1:5173";

const vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "5173"], {
  cwd: root,
  stdio: "inherit"
});

let electron;
let stopped = false;

function waitForServer(attempts = 80) {
  return new Promise((resolve, reject) => {
    const check = (remaining) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (remaining <= 0) {
          reject(new Error(`Vite did not start at ${url}`));
          return;
        }
        setTimeout(() => check(remaining - 1), 250);
      });
      request.setTimeout(500, () => request.destroy());
    };
    check(attempts);
  });
}

function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  if (electron && !electron.killed) electron.kill();
  if (vite && !vite.killed) vite.kill();
  setTimeout(() => process.exit(code), 80);
}

waitForServer()
  .then(() => {
    electron = spawn(electronBin, ["."], {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: url
      }
    });
    electron.on("exit", (code) => stop(code ?? 0));
  })
  .catch((error) => {
    console.error(error.message);
    stop(1);
  });

vite.on("exit", (code) => {
  if (!stopped && code !== 0) stop(code ?? 1);
});

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
