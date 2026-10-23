import { spawnSync } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../", import.meta.url));
const androidDir = path.join(rootDir, "android");
const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const build = spawnSync(wrapper, ["assembleDebug"], {
  cwd: androidDir,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (build.error) {
  throw build.error;
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const apkPath = path.join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const releaseDir = path.join(rootDir, "release");
await mkdir(releaseDir, { recursive: true });
await copyFile(apkPath, path.join(releaseDir, "blomo-android.apk"));
