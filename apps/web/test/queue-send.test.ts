import { test } from "node:test";
import assert from "node:assert/strict";
import { serial, timeoutSignal, triedAt } from "../src/offline.ts";

// REQ: PW-19 a press during an ongoing send waits for it and sends again; several presses give one more send, not many
test("PW-19 serial", async () => {
  let calls = 0, release: () => void = () => {};
  const run = serial(() => { calls++; return new Promise<boolean>((ok) => { release = () => ok(calls === 2); }); });
  const first = run();
  const second = run(), third = run();
  assert.equal(calls, 1, "the second waits for the first");
  assert.equal(second, third, "presses meanwhile share one rerun");
  release(); assert.equal(await first, false);
  await new Promise((r) => setTimeout(r));
  assert.equal(calls, 2);
  release(); assert.equal(await second, true);
  const later = run();
  assert.equal(calls, 3, "a new press after both have ended runs at once");
  release(); await later;
});

// REQ: PW-19 a send without an answer is given up after the time limit, also without AbortSignal.timeout
test("PW-19 timeoutSignal", () => {
  let fire: () => void = () => {};
  const s = timeoutSignal(20_000, (f, ms) => { assert.equal(ms, 20_000); fire = f; });
  assert.equal(s.aborted, false);
  fire();
  assert.equal(s.aborted, true);
});

// REQ: PW-19 the reason tells when it was tried
test("PW-19 triedAt", () => {
  assert.equal(triedAt("Ingen kontakt med servern.", new Date(2026, 10, 1, 9, 5)), "Ingen kontakt med servern. Försökte 09.05.");
});
