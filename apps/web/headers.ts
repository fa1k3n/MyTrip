// SP-12: writes public/_headers, the security headers of the static pages (Workers static assets), from the API's own
// headers plus the hashes of the film pages' inline scripts. Run after changing a film page: node apps/web/headers.ts
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { SECURITY_HEADERS, csp } from "../api/src/security-headers.ts";

const pub = new URL("./public/", import.meta.url);
const hashes = readdirSync(pub).filter((f) => f.endsWith(".html")).sort()
  .flatMap((f) => [...readFileSync(new URL(f, pub), "utf8").matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)])
  .map((m) => `'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
const headers = { ...SECURITY_HEADERS, "Content-Security-Policy": csp(hashes) };
writeFileSync(new URL("_headers", pub), `# Written by apps/web/headers.ts (SP-12); do not edit by hand.\n/*\n${Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join("\n")}\n`);
