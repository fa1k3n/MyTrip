import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { swSource } from "../sw-build.ts";
import { sv } from "../src/sv.ts";

const page = readFileSync(new URL("../public/om.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const login = readFileSync(new URL("../src/Admin.tsx", import.meta.url), "utf8");

// REQ: UI-13 the page "Om Basläger" with the film, reached from the login page
test("UI-13 the login page links to Om Basläger, which explains every part of the app", () => {
  assert.equal(sv.login.about, "Om Basläger");
  assert.match(login, /href="\/om\.html"/);
  assert.match(page, /<title>Om Basläger<\/title>/);
  assert.match(page, /<html lang="sv">/);
  for (const part of ["Drömmar", "Bjud in", "Önska", "Nåla", "Uppleva", "Minnas"]) assert.ok(page.includes(`chap: "${part}"`), part);
  assert.match(page, /href="\/"/, "a link back to the app");
  assert.match(page, /prefers-reduced-motion/);
});

// REQ: UI-13 SP-07 the page loads nothing from other sites and uses the app's colours
test("UI-13 the page loads nothing from other sites and has the colour tokens of index.css", () => {
  assert.ok(!/(src|href)="https?:/.test(page), "no external loads");
  assert.ok(!page.includes("@import"), "no external stylesheets");
  const tokens = (s: string) => Object.fromEntries([...(/:root\{([^}]*)\}/.exec(s)?.[1] ?? "").matchAll(/--(\w+):\s*(#[0-9A-Fa-f]{3,6})/g)].map((m) => [m[1], m[2]!.toUpperCase()]));
  const app = tokens(css), mine = tokens(page.replace(/:root\s*\{/, ":root{").replace(/\n\s*/g, ""));
  for (const k of ["bg", "card", "ink", "mute", "acc", "acct", "sage", "sageT", "line"]) assert.equal(mine[k], app[k], k);
});

// REQ: PW-21 opening another page does not replace the app's start page in the cache
test("PW-21 the service worker keeps only the start page as the page for offline use", () => {
  const src = swSource(["/"]);
  assert.match(src, /url\.pathname === "\/"/);
});

// REQ: UI-13 the film says the app is for a day trip as well as a long trip, in the soft-shape style
test("UI-13 the film shows the day trip and the long trip, with soft figures", () => {
  assert.ok(page.includes('chap: "Stort som smått"'));
  assert.match(page, /Dagstur/);
  assert.match(page, /class="skin"/);
});
