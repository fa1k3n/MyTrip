import { test } from "node:test";
import assert from "node:assert/strict";
import { dayTextWho, textWho, titleHiddenFrom } from "../src/format.ts";
import { donutSlices } from "../src/budget.ts";

const t = {
  places: [{ id: "park", name: "Lisebergs parkering", address: "Gatan 1" }, { id: "zoo", name: "Zoo", address: "Gatan 2" }],
  days: [
    { id: "d1", title: "Göteborg", summary: "Mot Liseberg", activities: [{ id: "a", text: "Liseberg", placeIds: [], hiddenFrom: ["anna"] }] },
    { id: "d2", title: "Lisebergs dag två", summary: "Hem", activities: [{ id: "b", text: "Zoo", placeIds: [] }] },
  ],
};

// REQ: AU-30 the eye of a text names whom it is hidden from, also through the name of a place it links
test("AU-30 textWho", () => {
  assert.deepEqual(textWho(t, ["Biljetter till Liseberg"]), ["anna"]);
  assert.deepEqual(textWho(t, ["Parkering"], "park"), ["anna"], "a place whose name gives it away");
  assert.deepEqual(textWho(t, ["Parkering"], "zoo"), []);
});

// REQ: AU-30 a day's title and summary are compared with hidden activities on every day of the trip
test("AU-30 day texts across the trip", () => {
  assert.deepEqual(dayTextWho(t, t.days[0], t.days[0].summary), ["anna"]);
  assert.deepEqual(titleHiddenFrom(t.days[1], t), ["anna"], "a hidden activity on another day");
  assert.deepEqual(titleHiddenFrom({ ...t.days[1], hiddenTitle: true }, t), []);
});

// REQ: AU-30 the budget chart groups hidden budget items as "Dold text"
test("AU-30 hidden budget items in the chart", () => {
  const s = donutSlices({ currency: "SEK", budget: [{ category: "", amount: 500, paid: false }, { category: "", amount: 100, paid: false }, { category: "Mat", amount: 300, paid: true }], expenses: [] } as never);
  assert.deepEqual(s.slices.map((x) => [x.label, x.value]), [["Dold text", 600], ["Mat", 300]]);
});
