import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

// REQ: WX-17 the weather is shown in Uppleva only: not on Nåla's day cards, and the credit only where the weather is
test("WX-17 no weather in Nåla", () => {
  const view = src("TripView.tsx");
  assert.ok(!/<Weather /.test(view), "Nåla's day card draws no weather");
  assert.match(view, /\{tab === "up" && Object\.keys\(p\.forecast\)\.length > 0 && \(/);
  assert.match(src("Uppleva.tsx"), /<Weather forecast=\{p\.forecast\[day\.id\]\} big \/>/);
});

// REQ: PI-07 Praktiskt is in Uppleva only, edited there by a role that may change it, with the AI's suggestions
test("PI-07 Praktiskt in Uppleva", () => {
  const side = src("Side.tsx"), up = src("Uppleva.tsx");
  assert.match(side, /export function PracticalInfo\(/);
  assert.ok(!/<PracticalInfo|<Info /.test(side), "not in Nåla's side column");
  assert.match(up, /const infoEdit = p\.perms\.parts\.info === "write";/);
  assert.match(up, /\{infoEdit \? <PracticalInfo t=\{t\} edit=\{p\.edit\}/);
  assert.match(up, /review=\{p\.review && \(p\.perms\.manager \|\| p\.who\?\.role === "planner"\) \? p\.review : undefined\}/);
  assert.match(src("TripView.tsx"), /count\("info", n\.info \?\? 0, \(\) => \{ setTab\("up"\); later\("sec-info"\); \}\)/, "the AI notice opens it in Uppleva");
});

// REQ: PI-07 the editing controls of Praktiskt show in Uppleva, although the rest of Uppleva hides them (UP-07)
test("PI-07 Praktiskt is not locked in Uppleva", () => {
  const css = src("index.css");
  assert.match(src("Side.tsx"), /<details className=\{`card sec \$\{may \? "unlock" : "lock"\} \$\{tint\}`\}/);
  assert.match(css, /\.lock \.unlock \[data-mut\]\{display:inline-flex!important\}\.lock \.unlock \.add:has\(> \[data-mut\]\)\{display:block\}/);
});
