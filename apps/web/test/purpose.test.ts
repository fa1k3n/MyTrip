import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestPurpose } from "../src/purpose.ts";

const day = (date: string, location: string, legs: object[], activities: object[]) => ({ date, location, legs, activities });
const act = (category?: string, placeIds: string[] = []) => ({ text: "x", category, placeIds });
const trip = {
  travelers: [{ name: "Anna" }, { name: "Erik" }, { name: "Lisa", age: 12 }, { name: "Olle", age: 9 }],
  places: [{ id: "mauer", name: "Mauergedenkstätte" }, { id: "spy", name: "Spionmuseet" }, { id: "tor", name: "Brandenburger Tor" }, { id: "ti", name: "Tropical Islands" }, { id: "cafe", name: "Café" }],
  days: [
    day("2026-10-26", "Malmö", [{ vehicle: "car" }], [act("Mat"), act("Mat", ["cafe"])]),
    day("2026-10-27", "Berlin", [{ vehicle: "car" }, { vehicle: "ferry" }], [act("Mat")]),
    day("2026-10-28", "Berlin", [{ vehicle: "transit" }], [act("Museum", ["mauer"]), act("Utsikt", ["tor"]), act("Museum", ["spy"])]),
    day("2026-10-29", "Berlin", [], [act("Bad", ["ti"])]),
    day("2026-10-31", "Trelleborg", [{ vehicle: "car" }], [act()]),
  ],
};

// REQ: MT-11 the purpose is proposed from the plan: length, dates, travelers with ages, transport, places, categories and highlights
test("MT-11 suggestPurpose from the planned days", () => {
  assert.equal(suggestPurpose(trip as never),
    "6 dagar, 26–31 oktober, för Anna, Erik, Lisa (12) och Olle (9). " +
    "Bil och färja via Malmö, Berlin och Trelleborg, med god mat, museer och utsikter – bland annat Mauergedenkstätte, Brandenburger Tor och Spionmuseet.");
});

// REQ: MT-11 short plans give short proposals, and a trip without days gives none
test("MT-11 suggestPurpose with little planned", () => {
  assert.equal(suggestPurpose({ travelers: [], places: [], days: [day("2026-10-27", "", [], [])] } as never), "1 dag, 27 oktober.");
  assert.equal(suggestPurpose({ travelers: [], places: [], days: [day("2026-10-30", "Berlin", [], []), day("2026-11-02", "Rostock", [], [])] } as never),
    "4 dagar, 30 oktober–2 november. Via Berlin och Rostock.");
  assert.equal(suggestPurpose({ travelers: [], places: [], days: [] } as never), null);
});
