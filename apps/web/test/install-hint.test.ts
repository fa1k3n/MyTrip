import { test } from "node:test";
import assert from "node:assert/strict";
import { showInstallHint } from "../src/access.ts";

const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const chrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1";
const android = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";

// REQ: PW-12 Safari on an iPhone, not installed, shows the hint until it is closed on that phone
test("PW-12 showInstallHint", () => {
  assert.equal(showInstallHint(safari, false, false), true);
  assert.equal(showInstallHint(safari, true, false), false, "already installed");
  assert.equal(showInstallHint(safari, false, true), false, "closed once, not again");
  assert.equal(showInstallHint(chrome, false, false), false, "only Safari can add it with the link along (PW-02)");
  assert.equal(showInstallHint(android, false, false), false);
});
