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

// REQ: UI-14 narration with the device's Swedish voice, started by a tap
test("UI-14 the film can be narrated by the device's Swedish voice", () => {
  assert.match(page, /id="voice"[^>]*aria-pressed="false"[^>]*hidden/);
  assert.match(page, /Berättarröst/);
  assert.match(page, /speechSynthesis/);
  assert.match(page, /\^sv/, "a Swedish voice is picked");
  assert.match(page, /SpeechSynthesisUtterance/);
});

// REQ: UI-15 the film fills the screen, also where the browser has no full screen
test("UI-15 the film has a full screen button with a fallback for the iPhone", () => {
  assert.match(page, /id="full"[^>]*aria-pressed="false"/);
  assert.match(page, /requestFullscreen/);
  assert.match(page, /\.player\.full\{position:fixed;inset:0/);
  assert.match(page, /Lämna helskärm/);
  assert.ok(!page.includes("Hela manuset"), "the script is gone");
});

// REQ: UI-19 recorded narration from /om-audio/, used only when made from the scene's current text, without a credit line
test("UI-19 the film plays recorded narration made from the current text, else the device's voice", () => {
  assert.match(page, /fetch\("\/om-audio\/index\.json"\)/);
  assert.match(page, /ix\?\.scenes\?\.\[i\]\?\.text === s\.text/, "a changed text falls back to the device's voice");
  assert.match(page, /voiceOn = true/, "the narration is on when the film starts");
  assert.ok(!page.includes("gjord med ElevenLabs"), "no credit line on a paid plan");
  const script = readFileSync(new URL("../om-voice.mjs", import.meta.url), "utf8");
  assert.match(script, /process\.env\.ELEVENLABS_API_KEY/, "the key comes from the environment");
  assert.ok(!/sk_[A-Za-z0-9]{20,}/.test(script), "no key in the script");
  const texts = [...page.matchAll(/^ {4}text: "((?:[^"\\]|\\.)*)",$/gm)];
  assert.equal(texts.length, (page.match(/chap: "/g) ?? []).length, "the script finds every scene's text");
});

// REQ: UI-17 the film works like an embedded video
test("UI-17 the film starts on a still frame and is played, paused and navigated like an embedded video", () => {
  assert.match(page, /class="player paused"/, "paused until asked");
  assert.match(page, /id="bigplay"[^>]*aria-label="Spela filmen"/);
  assert.match(page, /stage\.addEventListener\("click"/, "a tap on the picture plays or pauses");
  assert.match(page, /\.player\.idle \.controls\{opacity:0/, "the controls hide while playing");
  assert.match(page, /class="seg"/, "a progress bar with one part per chapter");
  assert.match(page, /id="chapbtn"[^>]*aria-expanded="false"[^>]*aria-controls="drawer"/, "chapters in a drawer, closed at first");
  assert.match(page, /\.drawer\{[^}]*transform:translateY\(100%\)/, "the drawer slides up from below");
  const row = page.slice(page.indexOf('<div class="row">'), page.indexOf("</div>", page.indexOf('<div class="row">')));
  assert.ok(row.trim().endsWith('</button>') && /id="full"[^]*$/.test(row) && row.lastIndexOf('id="full"') > row.lastIndexOf('id="chapbtn"'), "full screen is the last control, bottom right");
  assert.match(page, /e\.key === " " \|\| e\.key === "k"/);
  assert.match(page, /\.player\.paused \.scene \*\{animation-play-state:paused/, "a paused film stands still");
});

// REQ: UI-18 the figures move, out of step, and stand still with reduced motion
test("UI-18 the figures breathe, blink, swing their arms and walk in", () => {
  for (const k of ["breathe", "blink", "sway", "tilt", "walkin"]) assert.match(page, new RegExp(`@keyframes ${k}\\{`), k);
  assert.match(page, /walk: -?\d+/, "someone walks in");
  assert.match(page, /animation-delay:-\$\{d\}s/, "each figure out of step");
  assert.match(page, /prefers-reduced-motion:reduce\)\{\.on \*\{animation:none/);
});

// REQ: UI-13 the film says what the app says: the Minnas verdicts and the words of Saldo
test("UI-13 the film uses the app's words for the verdicts and Saldo", () => {
  for (const w of ["Igen", "Okej", "Inte igen", "får tillbaka", "ska betala", "Förslag på betalningar"]) assert.ok(page.includes(w), w);
  assert.ok(!page.includes("göra igen"));
});

// REQ: UI-20 the landing page for visitors, with a small login icon at the top right
test("UI-20 a visitor without a session or link lands on Om Basläger, which links to the login", async () => {
  const { landsOnAbout, ABOUT_PAGE } = await import("../src/access.ts");
  assert.equal(ABOUT_PAGE, "/om.html");
  assert.equal(landsOnAbout("", false, false), true);
  for (const hash of ["#login", "#u=eva.AbC", "#login=nokonto", "#login=fel"]) assert.equal(landsOnAbout(hash, false, false), false, hash);
  assert.equal(landsOnAbout("", true, false), false, "a link that no longer works shows the login page (AU-07)");
  assert.equal(landsOnAbout("", false, true), false, "#admin shows the login page");
  assert.match(page, /<a class="login" href="\/#login" aria-label="Logga in"/);
  assert.match(page, /\.login\{[^}]*width:44px;height:44px/, "a 44 px touch target (AC-05)");
});
