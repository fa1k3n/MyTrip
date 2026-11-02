import { test } from "node:test";
import assert from "node:assert/strict";
import { Trip } from "@trip/schema";
import { tripChanges } from "../src/changes.ts";

const base = Trip.parse({ id: "x", revision: 1, title: "Ny resa", timezone: "Europe/Stockholm", purpose: "Hamburg", stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [] });

// REQ: AI-10 a draft's timeline is named in words, not as a field name
test("AI-10 tripChanges names the timeline", () => {
  const day = { id: "d0", date: "2027-10-25", title: "Hamburg", summary: "Bil.", icons: ["🚗"], start: "09:00", end: "18:00", activities: [] };
  const next = Trip.parse({ ...base, title: "Höstlov i Hamburg", days: [day], stops: [{ label: "Hamburg", sub: "två nätter", dayId: "d0" }] });
  const texts = tripChanges(base, next).map((c) => `${c.kind} ${c.text}`);
  assert.ok(texts.includes("change Tidslinje: Hamburg"), texts.join(" | "));
  assert.ok(!texts.some((x) => x.includes("stops")), texts.join(" | "));
});
