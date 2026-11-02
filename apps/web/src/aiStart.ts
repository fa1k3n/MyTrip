// Starts an AI feature: asks once per trip before anything is sent (AI-64), and says why when it cannot run (AI-03).
import { api } from "./api.ts";
import { ask } from "./Ask.tsx"; // UI-11
import { aiErrorText } from "./format.ts";
import { sv } from "./sv.ts";

/** A proposal id (null when there was nothing to propose) and the reason, a message, or nothing when the user declined. */
export async function startAi(tripId: string, feature: string): Promise<{ proposalId: string | null; reason: string } | { message: string } | null> {
  let r = await api.ai(tripId, feature);
  if (!r.ok && r.error === "consent") {
    if (!(await ask(sv.aiRun.consentAsk, { ok: sv.aiRun.consentOk, details: sv.aiRun.consentDetails }))) return null;
    try { await api.aiConsent(tripId); } catch { return { message: sv.aiRun.errors.network }; }
    r = await api.ai(tripId, feature);
  }
  return r.ok ? { proposalId: r.proposalId, reason: r.reason } : { message: aiErrorText(r) };
}
