import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");
const page = read("installningar.html");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

// REQ: UI-31 the settings film: its own page, the same player and voice, and the chapters on inviting and the settings
test("UI-31 the settings film page", () => {
  assert.match(page, /<title>Bjud in till resan<\/title>/);
  assert.match(page, /<html lang="sv">/);
  for (const part of ["Inställningar", "Resan", "Vilka som är med", "Bjud in", "Skicka länken", "Har konto", "Glömt lösenordet", "Barnen", "Följare", "Behörigheter", "Inkorgen"])
    assert.ok(page.includes(`chap: "${part}"`), part);
  for (const id of ["bigplay", "voice", "cc", "chapbtn", "full", "drawer"]) assert.match(page, new RegExp(`id="${id}"`), id);
  assert.match(page, /fetch\("\/installningar-audio\/index\.json"\)/);
  assert.ok(!page.includes("/nala-audio/"), "its own recordings");
  assert.match(page, /prefers-reduced-motion/);
  for (const said of ["kuvertet", "mejlapp", "QR-kod", "Glömt lösenordet?"]) assert.ok(page.includes(said), said);
  assert.equal([...page.matchAll(/^ {4}text: "((?:[^"\\]|\\.)*)",$/gm)].length, 11);
});

// REQ: UI-31 SP-07 nothing from other sites, the app's colours, a paused scene complete, no white text on an ink box
test("UI-31 no external loads, the app's colours and the player's rules", () => {
  assert.ok(!/(src|href)="https?:/.test(page), "no external loads");
  const tokens = (s: string) => Object.fromEntries([...(/:root\{([^}]*)\}/.exec(s)?.[1] ?? "").matchAll(/--(\w+):\s*(#[0-9A-Fa-f]{3,6})/g)].map((m) => [m[1], m[2]!.toUpperCase()]));
  const app = tokens(css), mine = tokens(page.replace(/:root\s*\{/, ":root{").replace(/\n\s*/g, ""));
  for (const k of ["bg", "card", "ink", "mute", "acc", "acct", "sage", "sageT", "line"]) assert.equal(mine[k], app[k], k);
  assert.match(page, /if \(animate && playing\) scenes\[at\]\.classList\.add\("on"\);/);
  assert.ok(!/fill:var\(--ink\)"\/>\s*<text[^>]*fill:#fff/.test(page));
  assert.ok(!/fill:var\(--ink\)"\/>[\s\S]{0,200}stroke:#fff/.test(page));
});

// REQ: UI-24 UI-31 every film page lists the settings film, and the film's page lists the others and marks itself
test("UI-31 in Lär dig Basläger", () => {
  const list = (f: string) => /<section class="films"[\s\S]*?<\/section>/.exec(read(f))?.[0] ?? "";
  for (const f of ["om.html", "ai.html", "nala.html"]) assert.match(list(f), /<a class="film" href="\/installningar\.html"/, f);
  const own = list("installningar.html");
  for (const other of ["/om.html", "/ai.html", "/nala.html"]) assert.match(own, new RegExp(`<a class="film" href="${other}"`), other);
  assert.ok(!own.includes('href="/installningar.html"'));
  assert.match(own, /Den här filmen/);
});
