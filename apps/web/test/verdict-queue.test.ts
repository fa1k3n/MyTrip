import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { queueVerdict, verdictOps, withVerdicts, type WaitingVerdict } from "../src/offline.ts";
import { verdictCounts } from "../src/memories.ts";

const trip = (memories: { id: string; dreamId: string; by: string; verdict?: "again" | "ok" | "never"; note?: string }[]) => ({ id: "berlin", memories });

// REQ: UP-53 a later verdict on the same wish by the same traveler replaces the waiting one
test("UP-53 one waiting verdict per trip, wish and traveler", () => {
  let q: WaitingVerdict[] = [];
  q = queueVerdict(q, { tripId: "berlin", dreamId: "w1", by: "anna", verdict: "ok" });
  q = queueVerdict(q, { tripId: "berlin", dreamId: "w2", by: "anna", verdict: "again" });
  q = queueVerdict(q, { tripId: "berlin", dreamId: "w1", by: "anna", verdict: null });
  assert.deepEqual(q.map((x) => [x.dreamId, x.verdict]), [["w2", "again"], ["w1", null]]);
});

// REQ: UP-53 the waiting verdicts are shown at once with the counts
test("UP-53 the trip shown with the waiting verdicts", () => {
  const t = trip([{ id: "m-w1-bo", dreamId: "w1", by: "bo", verdict: "ok" }, { id: "m-w1-anna", dreamId: "w1", by: "anna", verdict: "never", note: "Kallt" }]);
  const q: WaitingVerdict[] = [{ tripId: "berlin", dreamId: "w1", by: "anna", verdict: "ok" }, { tripId: "other", dreamId: "w1", by: "bo", verdict: null }];
  const shown = withVerdicts(t, q);
  assert.deepEqual(verdictCounts(shown, "w1"), { again: 0, ok: 2, never: 0 });
  assert.equal(shown.memories.find((m) => m.by === "anna")!.note, "Kallt"); // the comment stays
  assert.deepEqual(withVerdicts(t, [{ tripId: "berlin", dreamId: "w1", by: "bo", verdict: null }]).memories.map((m) => m.by), ["anna"]);
});

// REQ: UP-53 sent as the change from the latest trip to the chosen verdict
test("UP-53 ops from the latest trip to the chosen verdict", () => {
  const latest = trip([{ id: "x", dreamId: "w9", by: "bo", verdict: "ok" }, { id: "m-w1-anna", dreamId: "w1", by: "anna", verdict: "ok" }]);
  assert.deepEqual(verdictOps(latest, { tripId: "berlin", dreamId: "w1", by: "anna", verdict: "ok" }), []); // already so: nothing to send
  assert.deepEqual(verdictOps(latest, { tripId: "berlin", dreamId: "w1", by: "anna", verdict: "again" }),
    [{ op: "set", path: "memories/1", value: { id: "m-w1-anna", dreamId: "w1", by: "anna", verdict: "again" } }]);
  assert.deepEqual(verdictOps(latest, { tripId: "berlin", dreamId: "w1", by: "anna", verdict: null }), [{ op: "remove", path: "memories/1" }]);
  assert.deepEqual(verdictOps(latest, { tripId: "berlin", dreamId: "w2", by: "anna", verdict: "never" }),
    [{ op: "add", path: "memories/-", value: { id: "m-w2-anna", dreamId: "w2", by: "anna", verdict: "never" } }]);
});

// REQ: UP-54 a save that reaches no server is a network failure; an answer from the server is not
test("UP-54 no answer is a network failure", async () => {
  const { noAnswer } = await import("../src/offline.ts");
  class Answered extends Error { status: number; constructor(status: number) { super(String(status)); this.status = status; } } // as the app's ApiError
  assert.equal(noAnswer(new TypeError("Failed to fetch")), true);
  assert.equal(noAnswer(new TypeError("Load failed")), true); // Safari on iPhone
  assert.equal(noAnswer(new Answered(403)), false);
  assert.equal(noAnswer(new Answered(503)), false);
});

// REQ: UP-54 the verdict buttons hand run a way to keep the verdict on the phone when the save gets no answer
test("UP-54 the verdict falls back on the phone's queue", () => {
  const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  assert.match(src("Verdicts.tsx"), /run\(\(x\) => memoryOps\(x, id, by, \{ verdict: v \}\), `verdict \$\{v\}`, keep\)/);
  assert.match(src("App.tsx"), /if \(offline && noAnswer\(e\)\) \{ offline\(\); await load\(\); return; \}/);
});
