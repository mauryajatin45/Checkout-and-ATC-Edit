/**
 * Removes build-only native binaries (esbuild, written in Go) from node_modules
 * after the production build. They are only needed to bundle the app, never at
 * runtime, and the old Go toolchain inside them shows up as critical CVEs in
 * Coolify's image scan.
 *
 * Only runs inside a Coolify/CI build so local dev environments are untouched.
 * If it can't tell it's a deploy build, it does nothing (safe default).
 */
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

// COOLIFY_* vars are not always passed into the image build (e.g. webhook
// deploys), which is why the 20 Nov builds shipped esbuild again. Coolify's
// Dockerfile and Railpack builds both run in /app, which no dev machine uses.
const isDeployBuild = Boolean(
  process.cwd() === "/app" ||
    process.env.NODE_ENV === "production" ||
    process.env.COOLIFY_RESOURCE_UUID ||
    process.env.COOLIFY_BRANCH ||
    process.env.COOLIFY_FQDN ||
    process.env.SOURCE_COMMIT ||
    process.env.CI ||
    process.env.STRIP_BUILD_BINARIES,
);

if (!isDeployBuild) {
  console.log("[strip-build-binaries] not a deploy build, skipping");
  process.exit(0);
}

const TARGETS = new Set(["esbuild", "@esbuild"]);
let removed = 0;

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    if (TARGETS.has(name) && dir.endsWith("node_modules")) {
      rmSync(full, { recursive: true, force: true });
      removed++;
      continue;
    }
    if (name === "node_modules" || dir.includes("node_modules")) walk(full);
  }
}

for (const root of process.argv.slice(2).length ? process.argv.slice(2) : ["."]) {
  walk(join(root, "node_modules"));
}
console.log(`[strip-build-binaries] removed ${removed} esbuild package(s)`);
