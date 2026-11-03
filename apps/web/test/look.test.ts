import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { EXPENSE_COLOUR, ROSE, SAND } from "../src/palette.ts";
import { outside } from "../src/outside.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const css = src("index.css");
const tsx = readdirSync(new URL("../src/", import.meta.url)).filter((f) => f.endsWith(".tsx"));

// REQ: UI-25 the two typefaces are served by the app itself, with their licence, and no font service is used
test("UI-25 own font files", () => {
  for (const [family, file] of [["Fraunces", "fraunces-latin-wght-normal.woff2"], ["Instrument Sans", "instrument-sans-latin-wght-normal.woff2"]]) {
    const face = new RegExp(`@font-face\\{font-family:"${family}";[^}]*url\\("\\./fonts/${file}"\\)`);
    assert.match(css, face, family);
    assert.ok(existsSync(new URL(`../src/fonts/${file}`, import.meta.url)), file);
  }
  assert.match(readFileSync(new URL("../src/fonts/OFL.txt", import.meta.url), "utf8"), /SIL Open Font License/);
  assert.doesNotMatch(css + readFileSync(new URL("../index.html", import.meta.url), "utf8"), /fonts\.googleapis|fonts\.gstatic/);
});

// REQ: UI-26 colours come from the tokens: no colour literal in a component, and a category has the same colour in the donut and as an icon
test("UI-26 colours from tokens", () => {
  for (const f of tsx) assert.doesNotMatch(src(f), /["'`]#[0-9a-fA-F]{3,8}\b/, f);
  for (const t of ["--sand", "--taupe", "--teal", "--rose"]) assert.match(css, new RegExp(`:root\\{[^}]*${t}:#`), t);
  assert.equal(EXPENSE_COLOUR.Mat, SAND);
  assert.equal(EXPENSE_COLOUR.Shopping, ROSE);
  const icons = src("CatIcon.tsx");
  assert.match(icons, /Mat: \{ shape: "utensils", color: SAND,/);
  assert.match(icons, /Shopping: \{ shape: "bag", color: ROSE,/);
  // one red: a serious warning and the red delete button
  assert.match(css, /:root\{--warn:#B3382C\}/);
  assert.match(css, /\.btn\.red\{background:#B3382C;/);
});

// REQ: UI-27 selected navigation is sage: the selected tab and the selected view button in Minnas
test("UI-27 selected navigation is sage", () => {
  assert.match(css, /\.tab\[aria-selected=true\]\{background:var\(--sage\)/);
  assert.match(css, /\.viewpick \.btn\.icon\[aria-pressed="true"\]\{background:var\(--sage\);border-color:var\(--sage\);color:#1b2a20\}/);
});

// REQ: UI-28 the vote heart is the line heart icon, not a text character
test("UI-28 heart icon", () => {
  for (const f of tsx) assert.ok(!src(f).includes("♥"), f);
  assert.match(src("Icons.tsx"), /heart: <path d="M19 14c1\.49/);
  assert.match(src("Dreams.tsx"), /className="heart"[^>]*>\s*<Icon name="heart" \/>/);
  assert.match(src("Side.tsx"), /className="votes"[^>]*><Icon name="heart" \/>/);
});

// REQ: UI-29 a dialog with an X closes when the area outside it is pressed
test("UI-29 outside the dialog", () => {
  const box = { left: 10, right: 110, top: 20, bottom: 220 };
  assert.equal(outside(box, 5, 50), true);
  assert.equal(outside(box, 50, 230), true);
  assert.equal(outside(box, 50, 50), false);
  assert.equal(outside(box, 110, 220), false, "the edge belongs to the dialog");
  // every dialog uses the one helper; the AI's working dialog has no X and is left out (AI-76)
  for (const f of tsx.filter((f) => src(f).includes("<dialog") && f !== "NewTrip.tsx")) {
    assert.match(src(f), /onOutside\(/, f);
    assert.doesNotMatch(src(f), /clientX < r\.left/, f);
  }
});

// REQ: UI-22 the marks in a section heading sit together after the heading; only the chevron is pushed to the right
test("UI-22 marks together", () => {
  assert.match(css, /\.mailflag\{display:inline-flex;align-items:center;gap:3px;margin-left:8px;/);
  assert.match(css, /\.mailflag svg\{width:15px;height:15px\}/);
});

// REQ: AC-05 icon buttons keep their 44 px, also in a crowded row, as the vote heart, and the permission switches are 44 px rows (AU-41)
test("AC-05 touch targets", () => {
  assert.match(css, /\.btn\.icon\{width:44px;height:44px;padding:0;flex:none;/);
  assert.match(css, /\.perms \.switch\{display:flex;min-height:44px/);
  assert.match(css, /\.heart\{[^}]*min-width:44px;min-height:44px/);
});

// REQ: AC-05 a text link keeps its look but gets a 44 px tall touch area; the emergency numbers are buttons of their own
test("AC-05 place links and emergency numbers", () => {
  assert.match(css, /\.place\{[^}]*position:relative[^}]*\}\.place::before\{content:"";position:absolute;inset:-10px -4px\}/);
  assert.match(css, /\.tel\{display:inline-flex;align-items:center;gap:6px;min-height:44px;/);
  const view = src("TripView.tsx");
  assert.match(view, /<a className="btn ghost tel" href=\{telHref\(n\.number\)\} aria-label=\{`\$\{c\.name\}, \$\{sv\.emergency\.call\(n\.label, n\.number\)\}`\} key=\{i\}><Icon name="phone" \/>/);
  assert.doesNotMatch(view, /<a className="place" href=\{telHref/);
});

// REQ: RS-11 a long word in an activity breaks or is hyphenated instead of running under the buttons; on a phone the pin and edit buttons stack
test("RS-11 the activity text keeps clear of the buttons", () => {
  assert.match(css, /\.act \.what,\.act \.what-col\{[^}]*overflow-wrap:anywhere;hyphens:auto[^}]*\}\.act \.place\{max-width:100%\}/);
  assert.match(css, /\.actbtns\{display:flex;flex:none;margin-left:auto\}/);
  assert.match(css, /@media \(max-width:599px\)\{\.actbtns\{flex-direction:column\}\}/);
  assert.match(src("Plan.tsx"), /<span className="actbtns"><IconButton icon="pin"/);
});

// REQ: TR-22 the way between two activities is joined by a dotted line, as in the films, instead of a dashed rule under it
test("TR-22 a dotted line between activities", () => {
  assert.match(css, /\.travel\{display:flex;align-items:center;gap:8px;padding:4px 0 4px 74px;color:var\(--mute\);font-size:\.85rem;position:relative\}/);
  assert.match(css, /\.travel::before\{content:"";position:absolute;left:58px;top:-2px;bottom:-2px;border-left:2px dotted var\(--mute\)\}/);
  assert.match(css, /\.upday>\.travel::before\{left:/);
});
