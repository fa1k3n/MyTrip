import { test } from "node:test";
import assert from "node:assert/strict";
import { placeView } from "../src/place.ts";

const full = { id: "spy", name: "Spionmuseet", address: "Leipziger Platz 9, 10117 Berlin", phone: "+49 30 398 200 450", notes: "Öppet 10–20.",
  website: "https://www.deutsches-spionagemuseum.de/en", bookingUrl: "https://www.visitberlin.de/x", bookingLabel: "Köp biljett (flexbiljett)" };

// REQ: PL-03 PL-04 PL-08 PL-09 PL-10 name, address, a callable phone link, a maps link, website and labelled booking button
test("PL-03 PL-04 PL-08 PL-09 PL-10 placeView with every field", () => {
  const v = placeView(full);
  assert.deepEqual([v.name, v.address, v.notes], [full.name, full.address, full.notes]);
  assert.deepEqual(v.phone, { text: "+49 30 398 200 450", href: "tel:+4930398200450" });
  assert.equal(v.mapsUrl, "https://www.google.com/maps/search/?api=1&query=Spionmuseet%2C%20Leipziger%20Platz%209%2C%2010117%20Berlin");
  assert.equal(v.embedUrl, "https://maps.google.com/maps?q=Spionmuseet%2C%20Leipziger%20Platz%209%2C%2010117%20Berlin&output=embed");
  assert.equal(v.website, full.website);
  assert.deepEqual(v.booking, { url: full.bookingUrl, label: "Köp biljett (flexbiljett)" });
});

// REQ: PL-05 PL-09 PL-10 missing phone, website and booking page are left out; a booking without a label gets a default
test("PL-05 PL-09 PL-10 placeView without optional fields", () => {
  const v = placeView({ id: "x", name: "Brandenburger Tor", address: "Pariser Platz, Berlin" });
  assert.deepEqual([v.phone, v.website, v.booking, v.notes], [undefined, undefined, undefined, undefined]);
  assert.equal(placeView({ ...full, bookingLabel: undefined }).booking?.label, "Boka biljett");
});
