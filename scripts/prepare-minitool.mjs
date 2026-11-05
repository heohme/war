import { copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(projectRoot, "dist-minitool");
await copyFile(resolve(projectRoot, "minitool/index.html"), resolve(outputRoot, "index.html"));
// React/DOM and ordinary Canvas 2D only: no engine, Worker, WASM or OffscreenCanvas.
await writeFile(resolve(outputRoot, "mini_tool.json"), '{"is_high_consumption_scene":false}\n');

console.log(`Prepared offline mini-tool artifact at ${outputRoot}`);
