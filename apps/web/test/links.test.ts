import { test } from "node:test";
import assert from "node:assert/strict";
import { addLink, cookieLinks, linksCookie, removeLink, tripOfLink } from "../src/access.ts";

const anna = "person.berlin.anna.AbC_-1", annaNew = "person.berlin.anna.ZzZ_-9", skane = "person.skane.anna.Qq-2", follow = "link.berlin.XyZ";

// REQ: PW-16 the phone keeps every trip link opened on it; a new link for the same trip and traveler replaces the old one
test("PW-16 addLink", () => {
  assert.deepEqual(addLink([], anna), [anna]);
  assert.deepEqual(addLink([anna], skane), [anna, skane]);
  assert.deepEqual(addLink([anna, skane], anna), [anna, skane], "no duplicates");
  assert.deepEqual(addLink([anna, skane], annaNew), [annaNew, skane], "a renewed link takes the old one's place");
  assert.deepEqual(addLink([anna], follow), [anna, follow], "the Följare link of the same trip is another link");
  assert.equal(tripOfLink(anna), "berlin");
  assert.equal(tripOfLink(follow), "berlin");
});

// REQ: PW-17 a trip is removed from the phone with its link
test("PW-17 removeLink", () => {
  assert.deepEqual(removeLink([anna, skane], anna), [skane]);
  assert.deepEqual(removeLink([skane], anna), [skane]);
});

// REQ: PW-16 the links also live in a cookie, which Safari copies to an app added to the home screen (PW-02)
test("PW-16 the links survive in a cookie", () => {
  const set = linksCookie([anna, skane]);
  assert.match(set, /^mytrip\.links=person\.berlin\.anna\.AbC_-1~person\.skane\.anna\.Qq-2; /);
  assert.match(set, /Secure/); assert.match(set, /SameSite=Strict/); assert.match(set, /Max-Age=\d{8}/);
  assert.match(linksCookie([]), /^mytrip\.links=; .*Max-Age=0/);
  assert.deepEqual(cookieLinks(`a=1; ${set.split(";")[0]}; b=2`), [anna, skane]);
  assert.deepEqual(cookieLinks("mytrip.links=junk~" + anna), [anna], "only well-formed links");
  assert.deepEqual(cookieLinks("mytrip.link=" + anna), [anna], "the single link of PW-02 is still read");
  assert.deepEqual(cookieLinks("a=1"), []);
});
