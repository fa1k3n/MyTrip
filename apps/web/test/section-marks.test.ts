import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestionsAt, type Pending } from "../src/proposals.ts";
import { toBook } from "../src/format.ts";
import { sv } from "../src/sv.ts";

const p = (id: string, path: string, feature = "prep"): Pending => ({ id, baseRevision: 1, ops: [{ op: "add", path, value: {} }], reason: "", status: "pending", at: "",
  source: { kind: "ai", feature, item: true } });

// REQ: UI-22 the marks count the AI suggestions waiting in each section and the bookings still to book
test("UI-22 section marks", () => {
  const list = [p("a", "tasks/-"), p("b", "bookings/-"), p("c", "bookings/-"), p("d", "dreams/-", "wishes"), { ...p("e", "tasks/-"), status: "rejected" as const }];
  assert.deepEqual(suggestionsAt(list, "prep", "tasks/-").map((x) => x.id), ["a"]);
  assert.deepEqual(suggestionsAt(list, "prep", "bookings/-").map((x) => x.id), ["b", "c"]);
  assert.deepEqual(suggestionsAt(list, "wishes", "dreams/-").map((x) => x.id), ["d"]);
  const b = (status: string) => ({ status });
  assert.equal(toBook({ bookings: [b("tobook"), b("ready"), b("tobook"), b("cancelled")] }), 2);
  assert.equal(sv.marks.suggestions(2), "2 AI-förslag väntar");
  assert.equal(sv.marks.suggestions(1), "1 AI-förslag väntar");
  assert.equal(sv.marks.toBook(1), "1 bokning att boka");
  assert.equal(sv.marks.toBook(3), "3 bokningar att boka");
});
