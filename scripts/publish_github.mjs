import fs from "node:fs";
import path from "node:path";

const token = process.env.GH_TOKEN || "";
const owner = "XHR-cpu123";
const repo = "ArkPet-XHR";
const apiBase = "https://api.github.com";

if (!token) {
  throw new Error("GH_TOKEN is required.");
}

async function github(method, url, body) {
  const response = await fetch(`${apiBase}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Codex"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      `${method} ${url} failed (${response.status}): ${
        data.message || text.slice(0, 300)
      }`
    );
  }
  return data;
}

function includeFile(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const top = normalized.split("/")[0];
  if (
    [".git", ".codex", "node_modules", "release", "voice-engine"].includes(
      top
    )
  ) {
    return false;
  }
  if (normalized.endsWith(".lnk") || normalized === "control-capture.png") {
    return false;
  }
  if (normalized === "scripts/publish_github.mjs") {
    return false;
  }
  if (top === "user-data") {
    return (
      normalized === "user-data" ||
      normalized === "user-data/desk-pet-state.json" ||
      normalized === "user-data/pet-store" ||
      normalized.startsWith("user-data/pet-store/")
    );
  }
  return true;
}

function walk(directory, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const childRelative = relative
      ? path.join(relative, entry.name)
      : entry.name;
    if (!includeFile(childRelative)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(absolute, childRelative));
    } else if (entry.isFile()) {
      files.push(childRelative);
    }
  }
  return files;
}

function safeStateContent() {
  const statePath = path.join(process.cwd(), "user-data", "desk-pet-state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  for (const service of Object.values(state.settings?.services || {})) {
    if (service) service.apiKey = "";
  }
  for (const model of state.localModels || []) {
    if (model.apiConfig) model.apiConfig.apiKey = "";
  }
  for (const profile of state.voiceProfiles || []) {
    profile.apiKey = "";
  }
  return Buffer.from(JSON.stringify(state, null, 2), "utf8");
}

async function createBlob(relativePath) {
  const absolute = path.join(process.cwd(), relativePath);
  const buffer =
    relativePath === path.join("user-data", "desk-pet-state.json")
      ? safeStateContent()
      : fs.readFileSync(absolute);
  if (buffer.length > 95 * 1024 * 1024) {
    throw new Error(`File is too large for GitHub blob API: ${relativePath}`);
  }
  const blob = await github("POST", `/repos/${owner}/${repo}/git/blobs`, {
    content: buffer.toString("base64"),
    encoding: "base64"
  });
  return {
    path: relativePath.replaceAll("\\", "/"),
    mode: "100644",
    type: "blob",
    sha: blob.sha
  };
}

async function main() {
  let parentSha = null;
  try {
    const branch = await github(
      "GET",
      `/repos/${owner}/${repo}/git/ref/heads/main`
    );
    parentSha = branch.object.sha;
  } catch (error) {
    if (!String(error.message).includes("Git Repository is empty")) {
      throw error;
    }
    await github("PUT", `/repos/${owner}/${repo}/contents/README.md`, {
      message: "Initialize ArkPet-XHR",
      content: Buffer.from("# ArkPet-XHR\n").toString("base64"),
      branch: "main"
    });
    const branch = await github(
      "GET",
      `/repos/${owner}/${repo}/git/ref/heads/main`
    );
    parentSha = branch.object.sha;
  }
  const files = walk(process.cwd()).sort();
  const tree = [];

  for (let index = 0; index < files.length; index += 6) {
    const batch = files.slice(index, index + 6);
    tree.push(...(await Promise.all(batch.map(createBlob))));
    process.stdout.write(
      `Uploaded ${Math.min(index + batch.length, files.length)}/${files.length}\r`
    );
  }
  process.stdout.write("\n");

  const { sha: treeSha } = await github(
    "POST",
    `/repos/${owner}/${repo}/git/trees`,
    { tree }
  );
  const version = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
  ).version;
  const commit = await github(
    "POST",
    `/repos/${owner}/${repo}/git/commits`,
    {
      message: `Publish Desk Pet Studio ${version}`,
      tree: treeSha,
      ...(parentSha ? { parents: [parentSha] } : {})
    }
  );
  await github("PATCH", `/repos/${owner}/${repo}/git/refs/heads/main`, {
    sha: commit.sha
  });

  let workflowDispatched = false;
  try {
    await github(
      "POST",
      `/repos/${owner}/${repo}/actions/workflows/release.yml/dispatches`,
      { ref: "main" }
    );
    workflowDispatched = true;
  } catch (error) {
    process.stderr.write(`Workflow dispatch failed: ${error.message}\n`);
  }

  if (process.env.PUBLISH_PUBLIC === "1") {
    await github("PATCH", `/repos/${owner}/${repo}`, { private: false });
  }
  process.stdout.write(
    JSON.stringify(
      {
        commit: commit.html_url,
        files: files.length,
        workflowDispatched,
        public: process.env.PUBLISH_PUBLIC === "1"
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
