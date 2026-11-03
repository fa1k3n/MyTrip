import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import type { AiCall } from "../src/ai.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const trip = (extra: object = {}) => ({
  id: "berlin", revision: 1, title: "Berlin", timezone: "Europe/Berlin", currency: "SEK", stops: [], packing: [], places: [], tasks: [],
  bookings: [{ id: "b1", kind: "stay", name: "Hotell", from: "2026-10-24", to: "2026-10-25", status: "paid", reference: "OLD-55120" }],
  aiConsent: { by: "Anna", at: "2026-11-01T10:00:00.000Z" },
  travelers: [{ id: "anna", name: "Anna", age: 41, packing: [] }, { id: "olle", name: "Olle", age: 9, packing: [] }],
  days: ["2026-10-24", "2026-10-25", "2026-10-26"].map((date, i) => ({ id: `d${i}`, date, title: "Dag", summary: "S.", icons: ["Natur"], start: "08:00", end: "18:00", activities: [] })),
  ...extra,
});
/** A fictional confirmation that the rules cannot date: no reference words they miss, weekday names only. */
const b64 = (s: string) => Buffer.from(s).toString("base64");
const raw = new TextEncoder().encode([
  "From: Pension Exempel <info@pension.example>", "To: inkorg@resa.example.org", "Subject: Bokningsbekräftelse", "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "",
  b64("Hej Anna!\nTack för din bokning. Bokningsnummer: PX-77812\nAnkomst lördag kväll, avresa måndag morgon, två nätter.\nRing 040-123 45 67 eller skriv till anna@example.org.\n"),
  "",
].join("\r\n"));
const reply = (input: object) => ({
  id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
  content: [{ type: "tool_use", id: "t1", name: "give_reading", input }],
  usage: { input_tokens: 2_000, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } },
});
const fake = (input: object) => {
  const seen: Parameters<AiCall>[0][] = [];
  const f: AiCall = async (req) => { seen.push(structuredClone(req)); return reply(input) as never; };
  return Object.assign(f, { seen });
};
async function setup(ai: AiCall, t: object = trip(), areas: object = {}) {
  const store = memoryStore([t]);
  await store.saveSettings({ ai: { enabled: true, areas } } as never);
  const app = createApp(store, tokens, { aiService: true, ai: { call: ai }, inboxDomain: "resa.example.org" });
  const req = (path: string, method = "GET", body?: BodyInit, type = "application/json", auth = "a") =>
    app.request(path, { method, headers: { "content-type": type, authorization: `Bearer ${auth}` }, body });
  const mailed = await (await req("/api/trips/berlin/mail", "POST", raw, "message/rfc822")).json();
  return { store, app, req, pid: mailed.proposalId as string };
}

// REQ: AI-60 "Läs med AI" fills what the reading without AI missed; the mail goes scrubbed; the reference never from the AI
test("AI-60 a mail proposal read with AI, scrubbed, the rules' values kept", async () => {
  const ai = fake({ kind: "stay", name: "Pension Exempel", from: "2026-10-24", to: "2026-10-26", checkIn: "18:00", reference: "HACK-1", price: { value: 1980, currency: "SEK" } });
  const { req, pid, store } = await setup(ai);
  const listed = await (await req("/api/trips/berlin/proposals")).json();
  assert.ok(!JSON.stringify(listed).includes("Ankomst lördag"), "the mail's text never goes to the browser");
  const r = await req(`/api/trips/berlin/mailread/${pid}`, "POST", "{}");
  assert.equal(r.status, 200, await r.clone().text());
  const { reading } = await r.json();
  assert.deepEqual([reading.from, reading.to, reading.checkIn, reading.kind, reading.price?.value], ["2026-10-24", "2026-10-26", "18:00", "stay", 1980]);
  assert.equal(reading.reference, "PX-77812"); // the rules' reference, not the AI's
  for (const k of ["from", "to", "checkIn", "price"]) assert.ok(reading.ai.includes(k), k); // marked as AI (AI-02)
  assert.ok(!reading.ai.includes("reference"));
  const sent = JSON.stringify(ai.seen[0]!.messages);
  for (const secret of ["anna@example.org", "040-123 45 67", "PX-77812", "OLD-55120", "Hej Anna"]) assert.ok(!sent.includes(secret), secret);
  assert.ok(sent.includes("Ankomst lördag"));
  const uses = await store.aiUses();
  assert.deepEqual(uses.map((u) => [u.feature, u.tripId]), [["mailread", "berlin"]]);
});

// REQ: AI-60 only for those who plan, with the area Mejl on and the trip's consent
test("AI-60 off without the area, without consent, and for a Resenär", async () => {
  const off = await setup(fake({}), trip(), { mail: false });
  assert.equal((await off.req(`/api/trips/berlin/mailread/${off.pid}`, "POST", "{}")).status, 409);
  const noConsent = await setup(fake({}), trip({ aiConsent: undefined }));
  assert.equal((await noConsent.req(`/api/trips/berlin/mailread/${noConsent.pid}`, "POST", "{}")).status, 409);
  const s = await setup(fake({}));
  const { secret } = await (await s.req("/api/trips/berlin/people/olle", "PUT", JSON.stringify({ role: "traveler" }))).json();
  const r = await s.req(`/api/trips/berlin/mailread/${s.pid}`, "POST", "{}", "application/json", `person.berlin.olle.${secret}`);
  assert.equal(r.status, 403);
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(7)]);
// REQ: AI-42 a receipt photo becomes amount, currency, date, text and category for the expense form
test("AI-42 a receipt read with AI", async () => {
  const ai = fake({ amount: 23.8, currency: "eur", date: "2026-10-25", text: "Lunch på Café Exempel", category: "Mat" });
  const { req, store } = await setup(ai);
  const r = await req("/api/trips/berlin/receipt", "POST", jpeg, "image/jpeg");
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual((await r.json()).reading, { amount: 23.8, currency: "EUR", date: "2026-10-25", text: "Lunch på Café Exempel", category: "Mat" });
  const content = ai.seen[0]!.messages[0]!.content as { type: string; source?: { media_type: string; data: string } }[];
  const img = content.find((b) => b.type === "image")!;
  assert.equal(img.source!.media_type, "image/jpeg");
  assert.equal(img.source!.data, Buffer.from(jpeg).toString("base64"));
  assert.ok(!JSON.stringify(ai.seen[0]!.messages).includes("Anna")); // nothing of the trip but its currency and dates
  assert.equal((await store.aiUses())[0]!.feature, "receipt");
});

// REQ: AI-42 values the form cannot use are left out; the area Kvitton off, or no image, is refused
test("AI-42 odd values left out; off and bad input refused", async () => {
  const ai = fake({ amount: -5, currency: "kronor", date: "25/10", text: "x".repeat(300), category: "Godis" });
  const { req } = await setup(ai);
  const r = await (await req("/api/trips/berlin/receipt", "POST", jpeg, "image/jpeg")).json();
  assert.deepEqual(Object.keys(r.reading), ["text"]);
  assert.equal(r.reading.text.length, 80);
  assert.equal((await req("/api/trips/berlin/receipt", "POST", "hej", "text/plain")).status, 400);
  const off = await setup(fake({}), trip(), { receipts: false });
  assert.equal((await off.req("/api/trips/berlin/receipt", "POST", jpeg, "image/jpeg")).status, 409);
});
