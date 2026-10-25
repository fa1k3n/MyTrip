import { test } from "node:test";
import assert from "node:assert/strict";
import { hiddenFromIn, similarTitles, textHiddenFrom } from "../src/index.ts";

// REQ: AU-24 titles are similar when they share a significant word, ignoring case, accents, punctuation, short and generic words
test("AU-24 similarTitles", () => {
  assert.ok(similarTitles("Liseberg", "Bil till Liseberg"));
  assert.ok(similarTitles("Lisebergs nöjespark", "Middag på liseberg!"), "a stem of four letters matches a longer word");
  assert.ok(similarTitles("Överraskning: spa", "Packa för SPA"));
  assert.ok(similarTitles("Café Ängel", "Fika på cafe"), "accents are ignored");
  assert.ok(!similarTitles("Bil till Liseberg", "Bil hem"), "generic words do not count");
  assert.ok(!similarTitles("Lunch på Zoo", "Lunch vid hotellet"));
  assert.ok(!similarTitles("Spa", "Spaning"), "a word under four letters matches only itself");
  assert.ok(!similarTitles("", "Zoo"));
});

// REQ: AU-24 a similar activity on the same day is hidden from the same travelers; other days are not affected
test("AU-24 hiddenFromIn", () => {
  const day = (acts: { id: string; text: string; hiddenFrom?: string[] }[]) => ({ activities: acts.map((a) => ({ ...a, placeIds: [], start: "10:00" })) });
  const d = day([
    { id: "a", text: "Liseberg", hiddenFrom: ["anna"] },
    { id: "b", text: "Bil till Liseberg" },
    { id: "c", text: "Lisebergs restaurang", hiddenFrom: ["bo"] },
    { id: "d", text: "Bil hem" },
  ]);
  const got = hiddenFromIn(d);
  assert.deepEqual(got.get("a"), ["anna", "bo"], "the hidden ones also resemble each other");
  assert.deepEqual(got.get("b"), ["anna", "bo"]);
  assert.deepEqual(got.get("c"), ["bo", "anna"]);
  assert.equal(got.get("d"), undefined);
  assert.equal(hiddenFromIn(day([{ id: "x", text: "Bil till Liseberg" }])).size, 0);
});

// REQ: AU-27 a day's text is hidden from the travelers of the hidden activities it resembles
test("AU-27 textHiddenFrom", () => {
  const d = { activities: [
    { id: "a", text: "Liseberg", placeIds: [], start: "10:00", hiddenFrom: ["anna"] },
    { id: "b", text: "Lunch på Lisebergs krog", placeIds: [], start: "12:00", hiddenFrom: ["bo"] },
    { id: "c", text: "Zoo", placeIds: [], start: "15:00" },
  ] };
  assert.deepEqual(textHiddenFrom(d, "Göteborg och Liseberg"), ["anna", "bo"]);
  assert.deepEqual(textHiddenFrom(d, "Zoo i Göteborg"), []);
});
