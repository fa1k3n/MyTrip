import { test } from "node:test";
import assert from "node:assert/strict";
import { readWish } from "../src/mailwish.ts";

// REQ: DB-23 the subject without forwarding prefixes is the title, the first link the wish's link
test("DB-23 a shared page becomes a wish", () => {
  const w = readWish({ subject: "Fwd: Tropiska Badparadiset", text: "Kolla här!\nhttps://example.org/bad?x=1.\nHälsningar" });
  assert.deepEqual(w, { title: "Tropiska Badparadiset", url: "https://example.org/bad?x=1", category: "Bad" });
});

// REQ: DB-23 without a subject the first line of text that is not only a link is the title
test("DB-23 the title from the text", () => {
  assert.equal(readWish({ subject: "", text: "\nhttps://example.org/a\n  Glasskiosken vid hamnen  \n" }).title, "Glasskiosken vid hamnen");
  assert.equal(readWish({ subject: "Re: ", text: "https://example.org/a" }).title, undefined, "nothing to call it");
});

// REQ: DB-23 a link only in the HTML part is found too; other schemes are not links
test("DB-23 the link from the HTML part", () => {
  const w = readWish({ subject: "Utsiktstornet", html: '<p>Se <a href="mailto:x@example.org">mig</a> och <a href="https://example.org/torn">tornet</a></p>' });
  assert.deepEqual([w.url, w.category], ["https://example.org/torn", "Utsikt"]);
});

// REQ: DB-23 a category guessed from words, otherwise Aktivitet
test("DB-23 the category", () => {
  const cat = (subject: string, text = "") => readWish({ subject, text }).category;
  assert.equal(cat("Naturhistoriska museet"), "Museum");
  assert.equal(cat("Pizzeria Napoli", "god restaurang"), "Mat");
  assert.equal(cat("Spa-dag"), "Avkoppling");
  assert.equal(cat("Loppmarknad i parken"), "Shopping");
  assert.equal(cat("Vandring till vattenfallet"), "Natur");
  assert.equal(cat("Klätterpark"), "Aktivitet");
});
