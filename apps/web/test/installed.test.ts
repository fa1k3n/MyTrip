import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieLink, forInstalled, freshAgain, installedTab, needsFullApp, linkCookie, linkFromText, linkHash, parseLinkHash, permsFor, safariUrl } from "../src/access.ts";

// REQ: PW-24 the app on the phone shows Önska, Uppleva and Minnas of what the role may see, Uppleva in the middle, and no settings
test("PW-24 the installed app's pages", () => {
  for (const role of ["admin", "planner", "traveler"] as const) {
    const p = forInstalled(permsFor(role, {}));
    assert.deepEqual([p.pages, p.settings], [["dr", "up", "mi"], false], role);
  }
  const some = { ...permsFor("admin", {}), pages: ["mi" as const, "nala" as const, "up" as const] };
  assert.deepEqual(forInstalled(some).pages, ["up", "mi"], "only what the role may see; Nåla stays in the full app");
  const noUp = { ...permsFor("admin", {}), pages: ["nala" as const] }; // a role with none of them keeps what it has
  assert.deepEqual(forInstalled(noUp).pages, ["nala"]);
});

// REQ: PW-24 a role that may see Nåla gets the link to the full app
test("PW-24 needsFullApp", () => {
  assert.equal(needsFullApp(permsFor("admin", {})), true);
  assert.equal(needsFullApp({ ...permsFor("admin", {}), pages: ["dr", "up", "mi"] }), false);
});

// REQ: PW-25 the app opens a trip on Uppleva, and again after an hour or more in the background
test("PW-25 installedTab and freshAgain", () => {
  assert.equal(installedTab(["dr", "up", "mi"]), "up", "Uppleva is chosen, though it is in the middle");
  assert.equal(installedTab(["dr", "mi"]), "dr", "a role without Uppleva gets its first page");
  assert.equal(freshAgain(0, 59 * 60_000), false);
  assert.equal(freshAgain(0, 60 * 60_000), true);
  assert.equal(freshAgain(undefined, 60 * 60_000), false, "never hidden");
});

// REQ: PW-24 the link to the full app opens the same link in Safari
test("PW-24 the full app opens in Safari with the same link", () => {
  for (const hash of ["#p=berlin.anna.AbC_-1", "#l=berlin.XyZ"]) {
    const key = (parseLinkHash(hash) as { key: string }).key;
    assert.equal(linkHash(key), hash);
    assert.equal(safariUrl("https://mytrip.example.workers.dev", key), `x-safari-https://mytrip.example.workers.dev/${hash}`);
  }
  assert.equal(linkHash(null), "");
  assert.equal(safariUrl("https://mytrip.example.workers.dev", null), "x-safari-https://mytrip.example.workers.dev/");
});

// REQ: PW-02 the link is also kept in a cookie, which Safari copies to an app added to the home screen
test("PW-02 the link survives in a cookie", () => {
  const set = linkCookie("person.berlin.anna.AbC_-1");
  assert.match(set, /^mytrip\.link=person\.berlin\.anna\.AbC_-1; /);
  assert.match(set, /Secure/); assert.match(set, /SameSite=Strict/); assert.match(set, /Max-Age=\d{8}/);
  assert.match(linkCookie(null), /^mytrip\.link=; .*Max-Age=0/);
  assert.equal(cookieLink("a=1; mytrip.link=person.berlin.anna.AbC_-1; b=2"), "person.berlin.anna.AbC_-1");
  assert.equal(cookieLink("a=1"), null);
  assert.equal(cookieLink("mytrip.link=junk"), null, "only a well-formed link is used");
});

// REQ: PW-02 if the cookie did not reach the installed app, a pasted link opens the trip once
test("PW-02 a pasted link is understood", () => {
  assert.equal(linkFromText("  https://mytrip.example.workers.dev/#p=berlin.anna.AbC_-1 \n"), "#p=berlin.anna.AbC_-1");
  assert.equal(linkFromText("Här är din länk: https://mytrip.example.workers.dev/#l=berlin.XyZ"), "#l=berlin.XyZ");
  assert.equal(linkFromText("https://mytrip.example.workers.dev/"), null);
  assert.equal(linkFromText("#admin"), null, "the admin login is not reached by pasting");
});
