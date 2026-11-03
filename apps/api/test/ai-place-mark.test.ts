import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES } from "../src/ai-features.ts";

// REQ: DQ-02 a place the wish helper suggests is marked as AI, so its address and facts are shown to verify (DQ-01)
test("DQ-02 places from the AI are marked", () => {
  const place = { op: "add" as const, path: "places/-", value: { id: "hagenbeck", name: "Tierpark Hagenbeck", address: "Lokstedter Grenzstraße 2, 22527 Hamburg", notes: "Öppet 9–18" } };
  assert.equal((FEATURES.wishes!.helper!.finish(place).value as { ai?: boolean }).ai, true);
});
