import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sv } from "../src/sv.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const page = readFileSync(new URL("../public/integritet.html", import.meta.url), "utf8");

// REQ: SP-09 the login, the beta notice and the settings link to the privacy policy
test("SP-09 the login, the beta notice and the settings link to /integritet.html", () => {
  assert.equal(sv.privacy.link, "Integritetspolicy");
  assert.match(src("Admin.tsx"), /href="\/integritet\.html"[^>]*>\{sv\.privacy\.link\}/, "login");
  const notice = /export const BetaNotice[\s\S]*?<\/div>;/.exec(src("Admin.tsx"))![0];
  assert.match(notice, /href="\/integritet\.html"/, "beta notice");
  assert.match(src("App.tsx"), /href="\/integritet\.html"/, "settings");
});

// REQ: SP-09 the page names every third party of SP-07, who is responsible, the rights and its date
test("SP-09 the privacy policy names every third party, the responsible person, the rights and a date", () => {
  assert.match(page, /<html lang="sv">/);
  assert.match(page, /<title>Integritetspolicy<\/title>/);
  assert.ok(!/(src|href)="https?:/.test(page.replace(/href="https:\/\/www\.imy\.se"/, "")), "no external loads");
  for (const who of ["OpenStreetMap", "Google Routes", "Open-Meteo", "Wikimedia Commons", "Anthropic", "Brevo", "Cloudflare", "Frankfurter", "Google"]) assert.ok(page.includes(who), who);
  for (const w of ["Johan Falkenström", "johan.falkenstrom@mailbox.org", "IMY", "kopia", "rättelse", "radering", "AI-04", "cookies"]) {
    if (w === "AI-04") continue; // a requirement ID is not shown to users
    assert.ok(page.includes(w), w);
  }
  assert.match(page, /Version av \d{1,2} \w+ \d{4}/, "the date shows");
  assert.match(page, /href="\/"/, "a link back to the app");
});
