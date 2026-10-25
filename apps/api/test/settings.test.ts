import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const req = (app: ReturnType<typeof createApp>, token: string, body?: unknown) =>
  app.request("/api/settings", {
    method: body === undefined ? "GET" : "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// REQ: AI-06 AI-08 every role reads the settings, with AI off by default and whether a service is configured
test("AI-06 AI-08 settings are readable and default to AI off", async () => {
  const res = await req(createApp(memoryStore(), tokens), "r");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ai: { enabled: false, areas: {} }, aiService: false });
  const withService = await req(createApp(memoryStore(), tokens, { aiService: true }), "r");
  assert.equal((await withService.json()).aiService, true);
});

// REQ: AI-09 only an admin changes the settings, and invalid settings are rejected
test("AI-09 only admin changes settings", async () => {
  const store = memoryStore();
  const app = createApp(store, tokens);
  const next = { ai: { enabled: true, areas: { mail: false } } };
  assert.equal((await req(app, "p", next)).status, 403);
  assert.equal((await req(app, "a", { ai: { areas: { kitchen: true } } })).status, 422);
  const ok = await req(app, "a", next);
  assert.equal(ok.status, 200);
  assert.deepEqual((await (await req(app, "r")).json()).ai, next.ai);
  assert.deepEqual((await store.loadSettings()).ai, next.ai);
});
