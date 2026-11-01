import { test } from "node:test";
import assert from "node:assert/strict";
import { enqueue, flush, sendError, type Sent } from "../src/offline.ts";

const http = (status: number, problems: string[] = []) => Object.assign(new Error("http"), { status, problems });

// REQ: PW-18 why a waiting expense is not sent: no contact, or the server's answer with its status; real rejections fail as before (PW-09)
test("PW-18 sendError", () => {
  assert.deepEqual(sendError(new TypeError("Load failed")), { offline: true, why: "Ingen kontakt med servern." });
  assert.deepEqual(sendError(http(409)), { offline: true, why: "Servern svarade 409." });
  assert.deepEqual(sendError(http(503)), { offline: true, why: "Servern svarade 503." });
  assert.equal("failed" in sendError(http(403)), true);
  assert.deepEqual(sendError(http(422, ["Belopp saknas"])), { failed: "Belopp saknas" });
  assert.equal("failed" in sendError(http(400)), true);
});

// REQ: PW-18 the reason stays on the waiting expense until it is sent
test("PW-18 flush keeps the reason on a waiting expense", async () => {
  const q = enqueue([], { id: "e1", amount: 5 });
  const after = await flush(q, async (): Promise<Sent> => ({ offline: true, why: "Servern svarade 503." }));
  assert.deepEqual(after, [{ expense: { id: "e1", amount: 5 }, state: "waiting", reason: "Servern svarade 503." }]);
  assert.deepEqual(await flush(after, async () => ({ ok: true })), []);
});
