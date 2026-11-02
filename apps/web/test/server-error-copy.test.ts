import { test } from "node:test";
import assert from "node:assert/strict";
import { useCopy } from "../src/offline.ts";

class Status extends Error { status: number; constructor(status: number) { super(String(status)); this.status = status; } }

// REQ: PW-26 a server error or no answer shows the phone's copy, as without a network
test("PW-26 server errors and no answer fall back on the copy", () => {
  assert.equal(useCopy(new TypeError("Failed to fetch")), true);
  assert.equal(useCopy(new Status(500)), true);
  assert.equal(useCopy(new Status(503)), true);
});

// REQ: PW-26 a refused link or a missing trip never shows the copy
test("PW-26 401, 403 and 404 do not use the copy", () => {
  for (const s of [400, 401, 403, 404, 409]) assert.equal(useCopy(new Status(s)), false, String(s));
});
