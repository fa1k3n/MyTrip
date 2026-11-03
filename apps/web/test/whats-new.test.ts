import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANGELOG_URL, laterVersion, whatsNewFor } from "../src/version.ts";
import { sv } from "../src/sv.ts";

// REQ: US-41 a new version is shown once per device that used an earlier one, with its main news and a link to the changelog
test("US-41 when the news of a version is shown", () => {
  assert.equal(whatsNewFor("0.2.0", "0.1.0", true), "0.2.0"); // used an earlier version
  assert.equal(whatsNewFor("0.2.0", null, true), "0.2.0"); // used the app before the news existed
  assert.equal(whatsNewFor("0.2.0", "0.2.0", true), undefined); // seen
  assert.equal(whatsNewFor("0.2.0", null, false), undefined); // a new device or user: nothing is new to them
  assert.equal(whatsNewFor("0.2.0", "0.3.0", true), undefined); // a version back
  assert.equal(whatsNewFor("dev", null, true), undefined); // not built
  assert.equal(whatsNewFor("9.9.9", null, true), undefined); // no news written for it
  assert.ok(laterVersion("0.10.0", "0.9.1") && !laterVersion("0.2.0", "0.2.0"));
});

// REQ: US-41 the news of 0.2.0 in a few Swedish lines, the dialog's texts and the link to the changelog
test("US-41 the news of 0.2.0", () => {
  const news = sv.whatsNew.news["0.2.0"]!;
  assert.ok(news.length >= 3 && news.length <= 7);
  assert.equal(sv.whatsNew.title("0.2.0"), "Nytt i Basläger 0.2.0");
  assert.match(CHANGELOG_URL, /^https:\/\/github\.com\/fa1k3n\/MyTrip\/blob\/main\/CHANGELOG\.md$/);
});
