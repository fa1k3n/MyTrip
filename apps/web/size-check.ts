// Fails the build when the page file is over the limit of PF-01: what index.html loads, gzipped (DP-17).
// Usage: node size-check.ts dist [limit in KB]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/** The gzip size of the scripts and stylesheets that index.html loads at the first visit. */
export function pageSize(dir: string, limitKb = 200) {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const names = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  const files = [...new Set(names)].map((name) => ({ name, bytes: gzipSync(readFileSync(join(dir, name))).length }));
  const bytes = files.reduce((n, f) => n + f.bytes, 0);
  return { files, bytes, limit: limitKb * 1024, ok: bytes <= limitKb * 1024 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = pageSize(process.argv[2] ?? "dist", Number(process.argv[3] ?? 200));
  for (const f of r.files) console.log(`${(f.bytes / 1024).toFixed(1).padStart(7)} KB  ${f.name}`);
  console.log(`size-check: ${(r.bytes / 1024).toFixed(1)} KB gzip of ${r.limit / 1024} KB (PF-01)`);
  if (!r.ok) process.exit(1);
}
