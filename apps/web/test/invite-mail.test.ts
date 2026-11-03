import { test } from "node:test";
import assert from "node:assert/strict";
import { addedMail, inviteMail } from "../src/format.ts";

// REQ: US-31 the invitation goes out with the phone's own mail app, to the traveler's address, with the trip's name and the link
test("US-31 a mailto link with the address, the trip and the password link", () => {
  const href = inviteMail({ to: "anna@example.org", name: "Anna", trip: "Fjällen & sjön", url: "https://baslager.app/#u=anna.AbC", until: "9 nov. 2026" });
  assert.ok(href.startsWith("mailto:anna%40example.org?"));
  const q = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  assert.equal(q.get("subject"), "Inbjudan till Fjällen & sjön i Basläger");
  const body = q.get("body")!;
  assert.match(body, /^Hej Anna!/);
  assert.ok(body.includes("https://baslager.app/#u=anna.AbC"));
  assert.ok(body.includes("9 nov. 2026"));
  assert.ok(!href.includes("+")); // spaces as %20, which every mail app reads
});

// REQ: US-37 someone who already has an account gets a mail that they are on the trip, with the login page and no password
test("US-37 a mailto link to log in and see the trip", () => {
  const href = addedMail({ to: "bo@example.org", name: "Bo", trip: "Fjällen & sjön", url: "https://baslager.app/#login" });
  assert.ok(href.startsWith("mailto:bo%40example.org?"));
  const q = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  assert.equal(q.get("subject"), "Du är med i Fjällen & sjön i Basläger");
  const body = q.get("body")!;
  assert.match(body, /^Hej Bo!/);
  assert.ok(body.includes("https://baslager.app/#login"));
  assert.ok(!/lösenordslänk|välj ett lösenord/i.test(body));
});
