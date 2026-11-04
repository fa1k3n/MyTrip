// DP-20: checks that the CI audits the runtime dependencies, that the workflow actions are pinned to a commit SHA and that the lock file has no known vulnerable versions of zod, @hono/node-server, vite and esbuild.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..", "..");
const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
  packages: Record<string, { version?: string }>;
};

function atLeast(version: string, min: string): boolean {
  const a = version.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

function versions(name: string): string[] {
  return Object.entries(lock.packages)
    .filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
    .map(([, p]) => p.version ?? "");
}

test("DP-20: the check job runs npm audit on runtime dependencies right after npm ci", () => {
  const steps = ci.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("- run:"));
  const ciIndex = steps.indexOf("- run: npm ci");
  assert.ok(ciIndex >= 0, "the check job runs npm ci");
  assert.equal(steps[ciIndex + 1], "- run: npm audit --omit=dev --audit-level=high");
});

test("DP-20: every GitHub Action in the CI workflow is pinned to a commit SHA", () => {
  const uses = ci.split("\n").map((l) => l.trim()).filter((l) => /^(- )?uses:/.test(l));
  assert.ok(uses.length > 0);
  for (const line of uses) assert.match(line, /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40}\b/, line);
});

test("DP-20: schema and mcp depend on zod 4", () => {
  for (const pkg of ["packages/schema", "packages/mcp"]) {
    const json = JSON.parse(readFileSync(join(root, pkg, "package.json"), "utf8"));
    assert.match(json.dependencies.zod, /^\^4\./, pkg);
  }
});

test("DP-20: the lock file has no version below the fix of a known advisory", () => {
  const fixed: Record<string, string> = {
    zod: "4.6.7", // GHSA-mrhx-c7xc-m3w5
    "@hono/node-server": "2.1.3", // GHSA-rmxm-3fg6-px4f
    vite: "6.4.4", // dev server advisories (Dependabot)
    esbuild: "0.25.0", // dev server advisory (Dependabot)
  };
  for (const [name, min] of Object.entries(fixed)) {
    const found = versions(name);
    assert.ok(found.length > 0, `${name} is in the lock file`);
    for (const v of found) assert.ok(atLeast(v, min), `${name} ${v} is at least ${min}`);
  }
});
