import { test } from "node:test";
import assert from "node:assert/strict";
import { memoriesLine } from "../src/format.ts";

// REQ: AI-91 the line naming the earlier trips whose memories the wish helper used
test("AI-91 Bygger på era omdömen från …", () => {
  assert.equal(memoriesLine([]), "");
  assert.equal(memoriesLine(["Berlin"]), "Bygger på era omdömen från Berlin.");
  assert.equal(memoriesLine(["Berlin", "Skåne", "Rom"]), "Bygger på era omdömen från Berlin, Skåne och Rom.");
});
