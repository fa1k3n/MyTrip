import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHANGELOG_URL, NEWS_PAGE, laterVersion, newsVersions, whatsNewFor } from "../src/version.ts";
import { sv } from "../src/sv.ts";

const newsSource = readFileSync(new URL("../src/WhatsNew.tsx", import.meta.url), "utf8");

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

// REQ: US-43 the page lists the news of every version, newest first
test("US-43 the news page lists every version with news, newest first", () => {
  assert.deepEqual(newsVersions({ "0.2.0": ["a"], "0.10.0": ["b"], "0.9.1": ["c"], "0.3.0": [] }), ["0.10.0", "0.9.1", "0.2.0"]);
  assert.deepEqual(newsVersions(sv.whatsNew.news), Object.keys(sv.whatsNew.news).sort((a, b) => (laterVersion(a, b) ? -1 : 1)));
  assert.ok(Object.keys(sv.whatsNew.news).includes("0.2.0"));
});

// REQ: US-43 the dialog's link opens the news page, not GitHub
test("US-43 the link of the dialog opens the news page", () => {
  assert.equal(NEWS_PAGE, "/#nytt");
  assert.match(newsSource, /href=\{NEWS_PAGE\}/);
  assert.equal(sv.whatsNew.pageTitle, "Nytt i Basläger");
  assert.match(newsSource, /href=\{CHANGELOG_URL\}/, "the page links to the changelog");
});
