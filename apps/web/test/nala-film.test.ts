import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");
const page = read("nala.html");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

// REQ: UI-30 the Nåla film: its own page, the same player and voice, and the chapters that go through Nåla
test("UI-30 the Nåla film page", () => {
  assert.match(page, /<title>Så funkar Nåla<\/title>/);
  assert.match(page, /<html lang="sv">/);
  for (const part of ["Dagarna", "Aktiviteter", "Flytta", "Nåla fast", "Vägen dit", "Önskningar", "Bokningar", "Runt omkring", "Överraskningar", "Uppleva"])
    assert.ok(page.includes(`chap: "${part}"`), part);
  for (const id of ["bigplay", "voice", "cc", "chapbtn", "full", "drawer"]) assert.match(page, new RegExp(`id="${id}"`), id);
  assert.match(page, /fetch\("\/nala-audio\/index\.json"\)/);
  assert.ok(!page.includes("/ai-audio/"), "its own recordings");
  assert.match(page, /prefers-reduced-motion/);
  // each scene's text on a line of its own, as om-voice.mjs reads it
  assert.equal([...page.matchAll(/^ {4}text: "((?:[^"\\]|\\.)*)",$/gm)].length, 11);
});

// REQ: UI-30 SP-07 nothing from other sites, and the app's colour tokens
test("UI-30 no external loads and the app's colours", () => {
  assert.ok(!/(src|href)="https?:/.test(page), "no external loads");
  const tokens = (s: string) => Object.fromEntries([...(/:root\{([^}]*)\}/.exec(s)?.[1] ?? "").matchAll(/--(\w+):\s*(#[0-9A-Fa-f]{3,6})/g)].map((m) => [m[1], m[2]!.toUpperCase()]));
  const app = tokens(css), mine = tokens(page.replace(/:root\s*\{/, ":root{").replace(/\n\s*/g, ""));
  for (const k of ["bg", "card", "ink", "mute", "acc", "acct", "sage", "sageT", "line"]) assert.equal(mine[k], app[k], k);
});

// REQ: UI-24 UI-30 every film page lists all three films, the one being read marked instead of linked
test("UI-30 in Lär dig Basläger", () => {
  const films = ["/om.html", "/ai.html", "/nala.html"];
  for (const self of films) {
    const list = /<section class="films"[\s\S]*?<\/section>/.exec(read(self.slice(1)))?.[0] ?? "";
    for (const other of films.filter((f) => f !== self)) assert.match(list, new RegExp(`<a class="film" href="${other}"`), `${self} links ${other}`);
    assert.ok(!list.includes(`href="${self}"`), `${self} does not link itself`);
    assert.match(list, /Så funkar Nåla/, self);
    assert.match(list, /Den här filmen/, self);
  }
});

// REQ: UI-17 a scene shown while the film is paused rests in its final state, so no card stands empty; it plays its animations when the film plays
test("UI-17 a paused scene is complete", () => {
  for (const f of ["om.html", "ai.html", "nala.html"]) {
    const s = read(f);
    assert.match(s, /if \(animate && playing\) scenes\[at\]\.classList\.add\("on"\);/, f);
    assert.match(s, /if \(p && !scenes\[at\]\.classList\.contains\("on"\)\) \{ void scenes\[at\]\.getBoundingClientRect\(\); scenes\[at\]\.classList\.add\("on"\); \}/, f);
  }
});

// REQ: UI-13 UI-23 UI-30 text on a box in the ink colour follows the theme, so it can be read also in dark mode, where the box turns light
test("UI-13 no white text on an ink box", () => {
  for (const f of ["om.html", "ai.html", "nala.html"]) {
    const s = read(f);
    assert.ok(!/fill:var\(--ink\)"\/>\s*<text[^>]*fill:#fff/.test(s), `${f}: white text on an ink box`);
    assert.ok(!/fill:var\(--ink\)"\/>[\s\S]{0,200}stroke:#fff/.test(s), `${f}: a white outline on an ink box`);
  }
});
