// Kör nu on the card a helper's suggestions show on (AI-96): only while the helper may run, with the runs left in its tooltip
// and, after a run, how many suggestions came. The suggestions themselves load again through PROPOSALS_CHANGED (aiStart.ts).
import { useEffect, useState } from "react";
import type { Trip } from "@trip/schema";
import { api, type HelperStatus } from "./api.ts";
import { IconButton } from "./Icons.tsx";
import { startAi } from "./aiStart.ts";
import { runNowShown, runNowTip } from "./format.ts";
import { sv } from "./sv.ts";

export function RunNow({ t, name }: { t: Trip; name: string }) {
  const [st, setSt] = useState<{ enabled: boolean; helpers: Record<string, HelperStatus> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { if (!busy) api.aiStatus(t.id).then(setSt, () => setSt(null)); }, [t.id, t.revision, t.ai, busy]); // again after a run: runs left
  if (!runNowShown(st, t.ai, name)) return null;
  const h = st!.helpers[name]!, label = sv.aiRun.helpers[name]?.[0] ?? name;
  const run = async () => {
    setBusy(true); setMsg("");
    const r = await startAi(t.id, name);
    if (r) setMsg("message" in r ? r.message : sv.aiRun.ran(r.proposalIds.length));
    setBusy(false);
  };
  return <span className="runnow">
    <IconButton icon="refresh" look="bare" tip="left" label={runNowTip(label, h)} disabled={busy || h.result === "cap" || h.remaining <= 0} onClick={() => void run()} />
    <span className="ro" role="status">{busy ? sv.loading : msg}</span>
  </span>;
}
