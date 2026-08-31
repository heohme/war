import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(projectRoot, "dist-minitool");
await copyFile(resolve(projectRoot, "minitool/index.html"), resolve(outputRoot, "index.html"));

console.log(`Prepared offline mini-tool artifact at ${outputRoot}`);
