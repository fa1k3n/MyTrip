import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createApp, memoryStore } from "../src/app.ts";
import { SECURITY_HEADERS, csp } from "../src/security-headers.ts";

const pub = new URL("../../web/public/", import.meta.url);
const read = (f: string) => readFileSync(new URL(f, pub), "utf8");
const films = readdirSync(pub).filter((f) => f.endsWith(".html"));

/** The headers of the `/*` rule in public/_headers (Workers static assets). */
const pageHeaders = () => {
  const lines = read("_headers").split("\n"), out: Record<string, string> = {};
  let inAll = false;
  for (const l of lines) {
    if (/^\S/.test(l)) { inAll = l.trim() === "/*"; continue; }
    const m = /^\s+([A-Za-z-]+):\s*(.*)$/.exec(l);
    if (inAll && m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
};
const directives = (policy: string) => Object.fromEntries(policy.split(";").map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([k, ...v]) => [k, v]));
const hashOf = (s: string) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;
const inlineScripts = (html: string) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

// The third parties SP-07 allows in the browser: the map (Google Maps embed), weather and places (Open-Meteo), currency rates (Frankfurter).
const SP07_HOSTS = ["https://maps.google.com", "https://www.google.com", "https://api.open-meteo.com", "https://geocoding-api.open-meteo.com", "https://api.frankfurter.dev"];

// REQ: SP-12 every API answer carries the security headers, also an answer to an unknown caller and to a login
test("SP-12 API answers carry every security header", async () => {
  const app = createApp(memoryStore([]), { read: "r", propose: "p", admin: "a" });
  for (const r of [await app.request("/api/trips"), await app.request("/api/trips", { headers: { authorization: "Bearer a" } }), await app.request("/api/auth/config")]) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(r.headers.get(k), v, `${k} on ${r.status}`);
    const d = directives(r.headers.get("content-security-policy") ?? "");
    assert.deepEqual(d["frame-ancestors"], ["'none'"]);
    assert.deepEqual(d["script-src"], ["'self'"], "no inline scripts from the API");
  }
});

// REQ: SP-12 the static pages (/ and every film page) get the same headers from public/_headers, under one rule for every path
test("SP-12 _headers covers / and the film pages", () => {
  const h = pageHeaders();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (k !== "Content-Security-Policy") assert.equal(h[k.toLowerCase()], v, k);
  assert.ok(films.length >= 4 && films.includes("om.html"), "the film pages are found");
  const d = directives(h["content-security-policy"] ?? "");
  const base = directives(csp());
  for (const k of Object.keys(base)) if (k !== "script-src") assert.deepEqual(d[k], base[k], `${k} as in the API`);
  for (const k of ["frame-ancestors", "base-uri", "form-action", "object-src"]) assert.ok(d[k], k);
  assert.deepEqual(d["frame-ancestors"], ["'none'"]);
});

// REQ: SP-12 scripts only from the own origin: no 'unsafe-inline' or eval, the film pages' inline scripts allowed by their exact hash only
test("SP-12 script-src allows only own files and the film scripts by hash", () => {
  const d = directives(pageHeaders()["content-security-policy"] ?? "");
  const want = ["'self'", ...films.flatMap((f) => inlineScripts(read(f)).map(hashOf))];
  assert.deepEqual([...d["script-src"]].sort(), [...want].sort(), `script-src in public/_headers should be: ${want.join(" ")}`);
  assert.ok(!Object.values(d).flat().some((v) => /unsafe-eval|\*/.test(v)), "no eval and no wildcards");
  for (const f of films) assert.doesNotMatch(read(f), /\son[a-z]+=["']/, `${f} has no inline event handlers`);
});

// REQ: SP-12 the CSP names only the hosts of SP-07
test("SP-12 CSP names only the hosts of SP-07", () => {
  for (const policy of [csp(), pageHeaders()["content-security-policy"] ?? ""]) {
    const hosts = Object.values(directives(policy)).flat().filter((v) => /^https?:/.test(v));
    assert.ok(hosts.length > 0);
    for (const h of hosts) assert.ok(SP07_HOSTS.includes(h), `${h} is a third party of SP-07`);
  }
});

// REQ: SP-12 camera (AI-42) and location (TR-23) only for the app itself
test("SP-12 Permissions-Policy", () => {
  const p = SECURITY_HEADERS["Permissions-Policy"];
  assert.match(p, /camera=\(self\)/);
  assert.match(p, /geolocation=\(self\)/);
  assert.match(SECURITY_HEADERS["Strict-Transport-Security"], /max-age=\d{7,}/);
  assert.equal(SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
  assert.equal(SECURITY_HEADERS["Referrer-Policy"], "strict-origin-when-cross-origin");
});
