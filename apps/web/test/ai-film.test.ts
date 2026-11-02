import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../public/ai.html", import.meta.url), "utf8");
const om = readFileSync(new URL("../public/om.html", import.meta.url), "utf8");
const newTrip = readFileSync(new URL("../src/NewTrip.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

// REQ: UI-23 the AI film: its own page, the same player, the chapters of making a trip with AI, and Basläger Plus coming soon
test("UI-23 the AI film page", () => {
  assert.match(page, /<title>Skapa resan med AI<\/title>/);
  assert.match(page, /<html lang="sv">/);
  for (const part of ["Beskriv din dröm", "Resa och rutt", "Bra att veta", "Aktiviteter", "Ni bestämmer", "Basläger Plus"]) assert.ok(page.includes(`chap: "${part}"`), part);
  assert.match(page, /kommer snart/);
  assert.ok(!/kr\/mån|per månad|\d+ ?kr\b|\bpris\b/i.test(page), "no price");
  for (const id of ["bigplay", "voice", "cc", "chapbtn", "full", "drawer"]) assert.match(page, new RegExp(`id="${id}"`), id);
  assert.match(page, /\/ai-audio\/index\.json/);
  assert.match(page, /prefers-reduced-motion/);
  assert.match(page, /class="skin"|skin/);
});

// REQ: UI-23 SP-07 nothing from other sites, and the app's colour tokens
test("UI-23 no external loads and the app's colours", () => {
  assert.ok(!/(src|href)="https?:/.test(page), "no external loads");
  const tokens = (s: string) => Object.fromEntries([...(/:root\{([^}]*)\}/.exec(s)?.[1] ?? "").matchAll(/--(\w+):\s*(#[0-9A-Fa-f]{3,6})/g)].map((m) => [m[1], m[2]!.toUpperCase()]));
  const app = tokens(css), mine = tokens(page.replace(/:root\s*\{/, ":root{").replace(/\n\s*/g, ""));
  for (const k of ["bg", "card", "ink", "mute", "acc", "acct", "sage", "sageT", "line"]) assert.equal(mine[k], app[k], k);
});

// REQ: UI-23 Om Basläger and the dialog Ny resa link to the AI film
test("UI-23 links to the AI film", () => {
  assert.match(om, /href="\/ai\.html"/);
  assert.match(newTrip, /href="\/ai\.html"/);
});
