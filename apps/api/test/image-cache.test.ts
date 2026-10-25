import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const trip = { id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", image: "berlin.jpg", stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [] };
const get = (app: ReturnType<typeof createApp>, etag?: string) =>
  app.request("/api/trips/berlin/image", { headers: { authorization: "Bearer r", ...(etag ? { "if-none-match": etag } : {}) } });

// REQ: MT-12 a replaced cover image shows at once: the browser revalidates with an ETag of the content
test("MT-12 cover image is revalidated by content", async () => {
  const images: Record<string, Uint8Array<ArrayBuffer>> = { "berlin.jpg": new Uint8Array([1, 2, 3]) };
  const app = createApp(memoryStore([trip], images), tokens);
  const first = await get(app);
  const etag = first.headers.get("etag")!;
  assert.match(etag, /^"[0-9a-f]{40}"$/);
  assert.match(first.headers.get("cache-control")!, /no-cache/);
  const again = await get(app, etag);
  assert.equal(again.status, 304);
  images["berlin.jpg"] = new Uint8Array([4, 5, 6]); // the image is replaced under the same name
  const changed = await get(app, etag);
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("etag"), etag);
});
