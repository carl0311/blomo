import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const sourceDir = path.join(rootDir, "dist");
const outputDir = path.join(rootDir, "release", "extension");

await rm(outputDir, { recursive: true, force: true });
await mkdir(path.dirname(outputDir), { recursive: true });
await cp(sourceDir, outputDir, { recursive: true });
