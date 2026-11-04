// DP-18: a hash of the fixed part of each AI feature's request, kept in ai-prompts.lock.json, so a change to a prompt or tool is seen
// in the commit and the user tests that then call the real AI service once are known beforehand. Used by the test and scripts/ai-lock.mjs.
import { createHash } from "node:crypto";
import { fixedOf } from "./ai.ts";
import { FEATURES } from "./ai-features.ts";
import { readingsFixed } from "./ai-read.ts";

/** The user tests (deploy/uat.md) whose recorded AI answers (DP-13) are asked for again when a fixed part changes. */
export const CASES: Record<string, string[]> = {
  draft: ["UAT-01", "UAT-02", "UAT-03", "UAT-17"], wishes: ["UAT-06"], prep: ["UAT-16"], packing: ["UAT-16"],
  "read:booking": [], "read:receipt": [], "read:mailKind": [],
};

const canonical = (v: unknown): unknown => (Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canonical(x)])) : v);
/** The hash of a fixed part; the order of keys does not count. */
export const hashOf = (v: unknown) => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex").slice(0, 16);

/** The hash of every feature's fixed part now. */
export function currentLock(): Record<string, string> {
  const r = readingsFixed();
  return Object.fromEntries([
    ...Object.entries(FEATURES).map(([k, f]) => [k, hashOf(fixedOf(f))]),
    ["read:booking", hashOf(r.booking)], ["read:receipt", hashOf(r.receipt)], ["read:mailKind", hashOf(r.mailKind)],
  ]);
}

/** The features whose fixed part differs from the lock, with the user tests that will call the real AI service once. */
export function staleOf(lock: Record<string, string>, now = currentLock()): string[] {
  return Object.keys({ ...lock, ...now }).filter((k) => lock[k] !== now[k])
    .map((k) => `${k}: ${CASES[k]?.length ? `${CASES[k]!.join(", ")} will call the real AI service once` : "no user test replays it"}`);
}
