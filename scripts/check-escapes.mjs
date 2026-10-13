import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const extensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".cjs",
  ".mjs",
  ".css",
  ".html"
]);
const skippedDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "release",
  "voice-engine",
  "user-data",
  "桌宠",
  "启动器",
  "桌宠工房启动器"
]);

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) continue;
      files.push(...walk(path.join(directory, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!extensions.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(path.join(directory, entry.name));
  }
  return files;
}

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

const chineseEscape = /\\u[4-9][0-9a-fA-F]{3}/;
const anyEscape = /\\u[0-9a-fA-F]{4}/;
const blocking = [];
const warnings = [];

for (const filePath of walk(root)) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    const position = `${relative(filePath)}:${index + 1}`;
    if (chineseEscape.test(line)) {
      blocking.push(`${position}  ${line.trim()}`);
    } else if (anyEscape.test(line)) {
      warnings.push(`${position}  ${line.trim()}`);
    }
  });
}

if (warnings.length) {
  console.warn(
    `发现 ${warnings.length} 处非中文字符范围的 Unicode 转义（仅提示，不阻塞）：`
  );
  for (const item of warnings) console.warn(`  ${item}`);
}

if (blocking.length) {
  console.error(
    `发现 ${blocking.length} 处中文 Unicode 转义序列，必须改回真实 UTF-8 中文字符：`
  );
  for (const item of blocking) console.error(`  ${item}`);
  process.exit(1);
}

console.log("源码编码检查通过：没有中文 Unicode 转义序列。");
