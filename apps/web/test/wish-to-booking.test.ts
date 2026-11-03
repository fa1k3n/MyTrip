import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

// REQ: BK-33 a mailed wish has "Det här är en bokning" for those who plan, asks first, and says why when it cannot move
test("BK-33 the button in the wish's view", () => {
  assert.match(src("Dreams.tsx"), /\{toBooking && w\.mailedAt && <p><IconButton icon="ticket" tip="right" label=\{sv\.mail\.toBooking\} onClick=\{toBooking\} \/><\/p>\}/);
  assert.match(src("App.tsx"), /toBooking=\{perms\(t\)\.settings \? \(\) => void wishToBooking\(dlg\.id\) : undefined\}/);
  assert.match(src("App.tsx"), /if \(!\(await ask\(sv\.mail\.toBookingAsk/);
  const sv = src("sv.ts");
  for (const k of ["toBooking: \"Det här är en bokning\"", "noMailKept:", "wishInUse:", "movedToBooking:"]) assert.ok(sv.includes(k), k);
});
