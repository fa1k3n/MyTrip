// DP-18: writes ai-prompts.lock.json from the fixed part of each AI feature's request, and prints what changed.
// Run from platform/: node apps/api/scripts/ai-lock.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { currentLock, staleOf } from "../src/ai-lock.ts";

const file = new URL("../ai-prompts.lock.json", import.meta.url);
const was = (() => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return {}; } })();
const now = currentLock();
const changes = staleOf(was, now);
writeFileSync(file, `${JSON.stringify(now, null, 2)}\n`);
console.log(changes.length ? `Lock updated:\n${changes.join("\n")}` : "Lock is current.");
