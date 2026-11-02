import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import { receiveMail } from "../src/mail.ts";
import { REJECT } from "../src/worker.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const trip = () => ({
  id: "berlin", revision: 1, title: "Höstlov", timezone: "Europe/Stockholm", stops: [], places: [], tasks: [], bookings: [], days: [],
  travelers: [{ id: "anna", name: "Anna", packing: [] }],
});
const b64 = (s: string) => Buffer.from(s).toString("base64");
/** A fictional mail with a subject and a text. */
const mail = (to: string, subject: string, text: string) => new TextEncoder().encode([
  "From: Anna Exempel <anna@example.org>", `To: ${to}`, `Subject: =?utf-8?B?${b64(subject)}?=`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", text, "",
].join("\r\n"));

async function setup() {
  const store = memoryStore([trip()]), app = createApp(store, tokens, { inboxDomain: "resa.example.org" });
  const r = await app.request("/api/trips/berlin/inbox", { method: "POST", headers: { authorization: "Bearer a" } });
  return { store, app, address: (await r.json()).address as string };
}

// REQ: DB-27 the same wish mailed again makes no new wish and is rejected, telling the sender it is already there
test("DB-27 a wish mailed twice", async () => {
  const { store, address } = await setup();
  assert.ok("wishId" in await receiveMail(store, mail(address, "Naturkundemuseum", "https://example.org/museum"), address));
  assert.deepEqual(await receiveMail(store, mail(address, "naturkundemuseum!", "https://example.org/museum"), address), { error: "duplicate" });
  assert.equal((await store.load("berlin"))!.dreams.length, 1);
  assert.match(REJECT.duplicate, /already/);
});

// REQ: DB-27 Gör till önskan on a mail whose wish is already on the trip leaves the proposal pending
test("DB-27 Gör till önskan of a wish that exists", async () => {
  const { store, app, address } = await setup();
  await receiveMail(store, mail(address, "Tropiska Badparadiset", "https://example.org/bad"), address);
  const r = await receiveMail(store, mail(address, "Bokning: Tropiska Badparadiset", "https://example.org/bad"), address);
  assert.ok("proposalId" in r);
  const res = await app.request(`/api/trips/berlin/proposals/${r.proposalId}/wish`, { method: "POST", headers: { authorization: "Bearer a" } });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "duplicate", problems: ["duplicate"] });
  assert.equal((await store.proposals("berlin"))[0]!.status, "pending");
  assert.equal((await store.load("berlin"))!.dreams.length, 1);
});
