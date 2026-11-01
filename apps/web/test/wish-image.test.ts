import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, Trip } from "@trip/schema";
import { cardImage, newWish } from "../src/wishes.ts";
import { fitSize, PHOTO_MAX } from "../src/photo.ts";
import { sv } from "../src/sv.ts";

const trip = () => Trip.parse({ id: "t", revision: 1, title: "t", timezone: "UTC", stops: [], days: [], places: [], bookings: [], tasks: [], travelers: [] });

// REQ: DB-05 a wish is added with an optional link, which must be http or https
test("DB-05 a new wish with a link", () => {
  const t = trip();
  const r = newWish({ title: " Zoo ", category: "Aktivitet", url: " https://zoo.example.org/ " }, "dream-1");
  assert.ok(r.ok);
  assert.deepEqual(Trip.parse(applyOps(t, r.ops)).dreams[0], { id: "dream-1", title: "Zoo", category: "Aktivitet", source: "Manuellt", icon: "✨", votes: 0, url: "https://zoo.example.org/" });
  const plain = newWish({ title: "Glass", category: "Mat", url: "" }, "dream-2");
  assert.ok(plain.ok);
  assert.equal(Trip.parse(applyOps(t, plain.ops)).dreams[0].url, undefined);
  assert.equal(newWish({ title: "Zoo", category: "Aktivitet", url: "zoo.example.org" }, "x").ok, false);
  assert.equal(newWish({ title: "", category: "Aktivitet", url: "" }, "x").ok, false);
});

// REQ: DB-09 a Commons image carries its credit: author, licence linked to its text, and the file page; an own photo none
test("DB-09 the card's image and credit", () => {
  assert.equal(cardImage({}), undefined);
  assert.deepEqual(cardImage({ image: { file: "abc", kind: "commons", page: "https://commons.wikimedia.org/wiki/File:Zoo.jpg", author: "Anna", licence: "CC BY-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0" } }),
    { file: "abc", whole: true, credit: { author: "Anna", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0", page: "https://commons.wikimedia.org/wiki/File:Zoo.jpg" } });
  assert.deepEqual(cardImage({ image: { file: "abc", kind: "own" } }), { file: "abc", whole: false });
  assert.deepEqual([sv.wish.photoBy, sv.wish.commons], ["Foto:", "Wikimedia Commons"]);
});

// REQ: DB-12 an own photo is scaled to at most 1 200 px on its longest side, keeping its shape
test("DB-12 the size of an own photo", () => {
  assert.deepEqual(fitSize(4032, 3024), { width: 1200, height: 900 });
  assert.deepEqual(fitSize(3024, 4032), { width: 900, height: 1200 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 }, "never larger");
  assert.equal(PHOTO_MAX, 300 * 1024);
});

// REQ: DB-07 removing the image marks the wish as tried, so it is not filled in again automatically; wishes still to try
test("DB-07 removing an image, and which wishes get one automatically", async () => {
  const { removeImage, toFill } = await import("../src/wishes.ts");
  const t = Trip.parse({ ...trip(), dreams: [
    { id: "a", title: "A", category: "Mat", source: "", icon: "✨", votes: 0, image: { file: "abcdefabcdefabcdef12", kind: "own" } },
    { id: "b", title: "B", category: "Mat", source: "", icon: "✨", votes: 0 },
    { id: "c", title: "C", category: "Mat", source: "", icon: "✨", votes: 0, imageTried: true },
    { id: "d", title: "D", category: "Mat", source: "", icon: "✨", votes: 0, hidden: true },
  ] });
  const after = Trip.parse(applyOps(t, removeImage(0)));
  assert.deepEqual([after.dreams[0].image, after.dreams[0].imageTried], [undefined, true]);
  assert.deepEqual(toFill(t), ["b"]);
});

// REQ: DB-09 the card carries no credit, only a mark on a Commons image; an own photo and a wish without an image none
test("DB-09 the card's credit mark", async () => {
  const { creditMark } = await import("../src/wishes.ts");
  assert.equal(creditMark({ image: { file: "abcdefabcdefabcdef12", kind: "commons", page: "https://commons.wikimedia.org/wiki/File:Zoo.jpg", licence: "CC BY 4.0" } }), true);
  assert.equal(creditMark({ image: { file: "abcdefabcdefabcdef12", kind: "own" } }), false);
  assert.equal(creditMark({}), false);
});

// REQ: DB-15 the detail view of a wish: image whole, title, category, source, link and the credit; a hidden wish does not open
test("DB-15 the wish's detail view", async () => {
  const { wishDetail } = await import("../src/wishes.ts");
  const { editTitle } = await import("../src/editKinds.ts");
  const commons = { file: "abcdefabcdefabcdef12", kind: "commons" as const, page: "https://commons.wikimedia.org/wiki/File:Zoo.jpg", author: "Anna", licence: "CC BY-SA 4.0", licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0" };
  const w = { id: "w", title: "Zoo", category: "Aktivitet", source: "Tips", icon: "✨", votes: 1, url: "https://zoo.example.org/", image: commons };
  assert.deepEqual(wishDetail(w), { title: "Zoo", category: "Aktivitet", source: "Tips", url: "https://zoo.example.org/",
    image: { file: commons.file, whole: true, credit: { author: "Anna", licence: "CC BY-SA 4.0", licenceUrl: commons.licenceUrl, page: commons.page } } });
  assert.deepEqual(wishDetail({ ...w, url: undefined, image: { file: "abcdefabcdefabcdef12", kind: "own" as const } }),
    { title: "Zoo", category: "Aktivitet", source: "Tips", image: { file: "abcdefabcdefabcdef12", whole: true } }, "an own photo is shown whole too, without credit");
  assert.deepEqual(wishDetail({ ...w, url: undefined, image: undefined }), { title: "Zoo", category: "Aktivitet", source: "Tips" });
  assert.equal(wishDetail({ ...w, hidden: true }), undefined, "a hidden wish does not open");
  assert.equal(editTitle({ kind: "wish", id: "w" }), sv.wish.about);
  assert.equal(sv.wish.about, "Om önskan");
  assert.equal(sv.wish.more("Zoo"), "Mer om Zoo");
});
