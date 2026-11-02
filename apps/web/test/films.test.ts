import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8");

// REQ: UI-24 both film pages list the films under "Lär dig Basläger", the one being read marked instead of linked
test("UI-24 Lär dig Basläger", () => {
  for (const [file, self, other] of [["om.html", "/om.html", "/ai.html"], ["ai.html", "/ai.html", "/om.html"]] as const) {
    const page = read(file), list = /<section class="films"[\s\S]*?<\/section>/.exec(page)?.[0] ?? "";
    assert.match(list, /<h2[^>]*>Lär dig Basläger<\/h2>/, file);
    assert.match(list, new RegExp(`<a class="film" href="${other}"`), `${file} links the other film`);
    assert.ok(!list.includes(`href="${self}"`), `${file} does not link itself`);
    assert.match(list, /Den här filmen/, file);
    assert.match(list, /Skapa resan med AI/);
    assert.match(list, /Om Basläger/);
    assert.match(list, /ca \d min/);
  }
});
