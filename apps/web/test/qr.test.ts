import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBits, qr, qrSvgPath, rsRemainder } from "../src/qr.ts";

// REQ: AU-31 the error correction is Reed-Solomon over GF(256); the known example of version 1-M ("HELLO WORLD")
test("AU-31 Reed-Solomon error correction", () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(rsRemainder(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

// REQ: AU-31 the format information for level M, with its BCH bits and mask
test("AU-31 format bits", () => {
  assert.equal(formatBits(0), 0b101010000010010);
  assert.equal(formatBits(7), 0b100101010100000);
});

// REQ: AU-31 the smallest version that holds the link; a link longer than version 10 holds is refused
test("AU-31 picks the smallest version", () => {
  assert.equal(qr("https://ex.se").size, 21, "14 bytes fit version 1-M");
  const link = "https://resa.example.org/#p=hostlov-2026.anna.AbCdEfGhIjKlMnOpQrStUv";
  assert.equal(link.length, 68);
  assert.equal(qr(link).size, 4 * 5 + 17, "68 bytes need version 5 at level M");
  assert.equal(qr("x".repeat(213)).size, 57);
  assert.throws(() => qr("x".repeat(214)));
});

// REQ: AU-31 the fixed patterns are in place and the format information names the mask used
test("AU-31 finder, timing and format", () => {
  const { size, modules, mask } = qr("https://resa.example.org/#l=berlin.XyZ_-123");
  const dark = (x: number, y: number) => modules[y]![x]!;
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    assert.ok(dark(cx, cy) && dark(cx - 3, cy - 3) && !dark(cx - 2, cy - 2), "a finder pattern in three corners");
  }
  for (let i = 8; i < size - 8; i++) assert.equal(dark(i, 6), i % 2 === 0, "the timing pattern");
  assert.ok(dark(8, size - 8), "the dark module");
  let read = 0; // the copy of the format bits by the bottom left and top right finders
  for (let i = 0; i < 8; i++) read |= Number(dark(size - 1 - i, 8)) << i;
  for (let i = 8; i < 15; i++) read |= Number(dark(8, size - 15 + i)) << i;
  assert.equal(read, formatBits(mask));
});

// REQ: AU-31 drawn as one SVG path with a quiet zone of four modules
test("AU-31 SVG path", () => {
  const code = qr("https://ex.se");
  const { path, box } = qrSvgPath(code);
  assert.equal(box, 21 + 8);
  assert.equal(path.match(/M/g)!.length, code.modules.flat().filter(Boolean).length);
  assert.match(path, /^M4 4h1v1h-1z/, "the top left module, moved by the quiet zone");
});
