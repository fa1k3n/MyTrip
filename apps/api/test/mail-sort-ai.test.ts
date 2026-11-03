import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, memoryStore } from "../src/app.ts";
import type { AiCall } from "../src/ai.ts";

const tokens = { read: "r", propose: "p", admin: "a" };
const trip = (extra: object = {}) => ({
  id: "seoul", revision: 1, title: "Seoul", timezone: "Asia/Seoul", currency: "KRW", stops: [], packing: [], places: [], tasks: [], bookings: [],
  ai: true, aiConsent: { by: "Anna", at: "2026-11-01T10:00:00.000Z" },
  travelers: [{ id: "anna", name: "Anna", packing: [] }],
  days: ["2027-04-01", "2027-04-02"].map((date, i) => ({ id: `d${i}`, date, title: "Dag", summary: "S.", icons: ["Natur"], start: "08:00", end: "18:00", activities: [] })),
  ...extra,
});
const b64 = (s: string) => Buffer.from(s).toString("base64");
/** A fictional mail with a plain text body. */
const mail = (subject: string, body: string) => new TextEncoder().encode([
  "From: Hotell <info@hotel.example>", "To: inkorg@resa.example.org", `Subject: =?utf-8?B?${b64(subject)}?=`, "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(body), ""].join("\r\n"));
/** A Korean confirmation without any signal of BK-31: no code line, no price with a date. */
const korean = mail("숙박 안내", "안녕하세요 Anna 님\n월요일에 도착하시고 금요일에 떠나십니다.\n감사합니다");
const tip = mail("Kolla den här!", "En fin park: https://example.org/park");
const fake = (kind: string) => {
  const seen: Parameters<AiCall>[0][] = [];
  const f: AiCall = async (req) => { seen.push(structuredClone(req)); return {
    id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use", stop_sequence: null,
    content: [{ type: "tool_use", id: "t1", name: "give_reading", input: { kind } }],
    usage: { input_tokens: 400, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } } } as never; };
  return Object.assign(f, { seen });
};
async function setup(ai?: AiCall, t: object = trip(), areas: object = {}) {
  const store = memoryStore([t]);
  await store.saveSettings({ ai: { enabled: true, areas } } as never);
  const app = createApp(store, tokens, ai ? { aiService: true, ai: { call: ai } } : {});
  const req = (path: string, method = "GET", body?: BodyInit, type = "application/json") =>
    app.request(path, { method, headers: { "content-type": type, authorization: "Bearer a" }, body });
  const send = (raw: Uint8Array<ArrayBuffer>) => req("/api/trips/seoul/mail", "POST", raw, "message/rfc822");
  return { store, req, send };
}

// REQ: BK-32 a mail without signals is sorted by the AI service: a booking in any language becomes a proposal, scrubbed, counted
test("BK-32 the AI service sorts what the rules cannot", async () => {
  const ai = fake("booking");
  const { send, store } = await setup(ai);
  const r = await send(korean);
  assert.equal(r.status, 202, await r.clone().text());
  assert.ok((await r.json()).proposalId);
  assert.equal(ai.seen.length, 1);
  assert.ok(!JSON.stringify(ai.seen[0]!.messages).includes("Anna"), "the trip's names are taken out");
  assert.equal((await store.aiUses())[0]!.feature, "mailsort");
});

// REQ: BK-32 the AI service may say wish; it is not asked when the rules are sure, nor without consent or the area, and then a wish is made
test("BK-32 when the AI service is not asked", async () => {
  const wish = fake("wish");
  assert.equal((await (await setup(wish)).send(tip)).status, 201);
  assert.equal(wish.seen.length, 1);
  const sure = fake("wish");
  assert.equal((await (await setup(sure)).send(mail("Önskan: Hanok", "https://example.org/hanok"))).status, 201);
  assert.equal((await (await setup(sure)).send(mail("Tack", "예약번호: K7Q2-881"))).status, 202);
  assert.equal(sure.seen.length, 0, "the rules decided");
  const off = fake("booking");
  assert.equal((await (await setup(off, trip({ aiConsent: undefined }))).send(korean)).status, 201);
  assert.equal((await (await setup(off, trip(), { mail: false })).send(korean)).status, 201);
  assert.equal(off.seen.length, 0);
  assert.equal((await (await setup()).send(korean)).status, 201, "no AI service: a wish as before");
});

// REQ: BK-33 a wish that came by mail becomes a pending booking proposal from the kept mail, and the wish goes
test("BK-33 a mailed wish becomes a booking", async () => {
  const { send, req, store } = await setup();
  const { wishId } = await (await send(mail("Hotel Hanok", "Check-in 15:00\nAdress: Bukchon-ro 11, Seoul"))).json();
  assert.ok(wishId);
  assert.equal((await store.proposals("seoul")).filter((p) => p.status === "pending").length, 0, "the kept mail is no proposal to review");
  const r = await req(`/api/trips/seoul/dreams/${wishId}/booking`, "POST");
  assert.equal(r.status, 201, await r.clone().text());
  const { proposalId } = await r.clone().json();
  const p = (await store.proposals("seoul")).find((x) => x.id === proposalId)!;
  assert.deepEqual([p.status, p.source?.kind, p.booking?.checkIn], ["pending", "mail", "15:00"]);
  assert.ok(!(await store.load("seoul"))!.dreams.some((w) => w.id === wishId));
  assert.equal((await req(`/api/trips/seoul/dreams/${wishId}/booking`, "POST")).status, 404, "only once");
});

// REQ: BK-33 a planned wish, a wish without a kept mail and a Resenär are refused
test("BK-33 refused when planned, without the mail, or for a Resenär", async () => {
  const { send, req, store } = await setup();
  const { wishId } = await (await send(mail("Hotel Hanok", "Check-in 15:00"))).json();
  const t = (await store.load("seoul"))!;
  assert.ok(await store.save({ ...t, revision: t.revision + 1, days: t.days.map((d, i) => (i ? d : { ...d, activities: [{ id: "a1", text: "Hanok", placeIds: [], estimated: false, dreamId: wishId }] })) }, t.revision));
  assert.equal((await req(`/api/trips/seoul/dreams/${wishId}/booking`, "POST")).status, 409);
  assert.equal((await req("/api/trips/seoul/dreams/okand/booking", "POST")).status, 404);
  const anna = (await (await req("/api/trips/seoul/people/anna", "PUT", JSON.stringify({ role: "traveler" }))).json()).secret;
  const r = await createApp(store, tokens).request(`/api/trips/seoul/dreams/${wishId}/booking`, { method: "POST", headers: { authorization: `Bearer person.seoul.anna.${anna}` } });
  assert.equal(r.status, 403);
});
