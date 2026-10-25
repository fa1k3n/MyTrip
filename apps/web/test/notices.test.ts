import { test } from "node:test";
import assert from "node:assert/strict";
import { linkForTrip } from "../src/access.ts";
import { noticeState } from "../src/notices.ts";
import { swFiles, swSource } from "../sw-build.ts";

const can = { push: true, iphone: true, installed: true, permission: "default" as NotificationPermission, key: true, on: false };

// REQ: NT-03 the settings say whether the phone can get notices, and why not
test("NT-03 noticeState", () => {
  assert.equal(noticeState(can), "off");
  assert.equal(noticeState({ ...can, on: true, permission: "granted" }), "on");
  assert.equal(noticeState({ ...can, installed: false, push: false }), "install", "an iPhone gets notices only in the installed app");
  assert.equal(noticeState({ ...can, iphone: false, push: false }), "unsupported");
  assert.equal(noticeState({ ...can, permission: "denied" }), "denied");
  assert.equal(noticeState({ ...can, key: false }), "serverOff");
  assert.equal(noticeState({ ...can, on: true, permission: "default" }), "off", "on here, but the permission was taken back");
});

// REQ: NT-04 tapping a notice opens the app on its trip, with the link the phone keeps for it
test("NT-04 the notice opens its trip", () => {
  const links = ["person.berlin.anna.A1", "person.skane.anna.B2"];
  assert.equal(linkForTrip(links, "skane"), "person.skane.anna.B2");
  assert.equal(linkForTrip(links, "rom"), null);
  const src = swSource(swFiles([]));
  assert.match(src, /addEventListener\("push"/);
  assert.match(src, /showNotification/);
  assert.match(src, /notificationclick/);
  assert.match(src, /\/\?trip=/);
});
