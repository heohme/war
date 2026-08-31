import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(projectRoot, "dist-minitool");
const artifactRoot = resolve(projectRoot, "artifacts");
const artifactPath = resolve(artifactRoot, "soudache-minitool-ai.zip");
const allowedExtensions = new Set([".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".woff", ".woff2", ".json"]);
const forbiddenPatterns = [
  ["fetch(", /\bfetch\s*\(/],
  ["WebSocket", /\bWebSocket\b/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["EventSource", /\bEventSource\b/],
  ["WebRTC", /\bRTCPeerConnection\b/],
  ["Worker", /\b(?:SharedWorker|Worker)\s*\(/],
  ["service worker", /navigator\.serviceWorker/],
  ["dynamic code", /\beval\s*\(|new\s+Function\s*\(/],
  ["external resource", /(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\//i],
];

async function collect(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collect(path));
    else result.push(path);
  }
  return result;
}

const files = await collect(outputRoot);
const indexFiles = files.filter((file) => extname(file) === ".html");
if (indexFiles.length !== 1 || relative(outputRoot, indexFiles[0]) !== "index.html") {
  throw new Error("index.html must be the only HTML file and must be at ZIP root");
}

for (const file of files) {
  const relativePath = relative(outputRoot, file);
  if (!allowedExtensions.has(extname(file).toLowerCase())) throw new Error(`Unsupported file type: ${relativePath}`);
  if (![".html", ".css", ".js", ".json"].includes(extname(file).toLowerCase())) continue;
  const contents = await readFile(file, "utf8");
  for (const [label, pattern] of forbiddenPatterns) {
    if (pattern.test(contents)) throw new Error(`Forbidden ${label} found in ${relativePath}`);
  }
}

const indexHtml = await readFile(resolve(outputRoot, "index.html"), "utf8");
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(indexHtml)) throw new Error("Inline script found in index.html");
if (/type=["']module["']/i.test(indexHtml)) throw new Error("Module script found in index.html");
if (/\son\w+\s*=/i.test(indexHtml)) throw new Error("Inline event handler found in index.html");

await mkdir(artifactRoot, { recursive: true });
await rm(artifactPath, { force: true });
const zipped = spawnSync("zip", ["-q", "-r", artifactPath, ".", "-x", "*.DS_Store"], { cwd: outputRoot, encoding: "utf8" });
if (zipped.status !== 0) throw new Error(zipped.stderr || "zip failed");
const size = (await stat(artifactPath)).size;
console.log(`Packaged ${files.length} files: ${artifactPath} (${(size / 1024 / 1024).toFixed(2)} MiB)`);
