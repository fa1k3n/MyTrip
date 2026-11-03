// A new trip from "Beskriv din dröm" (AI-10): the description becomes the purpose as written. With AI the draft of the trip is
// applied at once, since pressing "Skapa med AI" is the approval (AI-78), and so is what the helpers then make on it (AI-80).
// Without AI the trip is made with the purpose only.
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Trip } from "@trip/schema";
import { api, type AiAdded } from "./api.ts";
import { aiErrorText } from "./format.ts";
import { Icon, IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";

/** The helpers run right after the draft, in this order in the checklist (AI-76, AI-80). */
export const DRAFT_HELPERS = ["prep", "wishes", "packing"] as const;
type Step = { state: "wait" | "run" | "done" | "failed"; since: number; note?: string }; // wait: shown greyed until it starts (AI-76)
/** The trip before and after its draft, for Ångra (AI-78, ED-22). */
export type Drafted = { before: Trip; after: Trip };

export function NewTripDialog({ ai, created, helperDone, allDone, close }: {
  ai: boolean;
  created: (id: string, notice?: string, drafted?: Drafted) => void; // closes the dialog and opens the trip
  helperDone: (tripId: string) => void; // what a helper added, also after the dialog has closed (AI-80)
  allDone: (tripId: string, added: AiAdded, memoriesFrom: string[]) => void; // the notice of what the AI added (AI-82), and the trips whose memories it used (AI-91)
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [steps, setSteps] = useState<Record<string, Step> | null>(null); // AI-76: the AI service is making the trip
  const [ready, setReady] = useState<{ id: string; drafted: Drafted } | null>(null); // the draft is in; the helpers may still run
  const gone = useRef(false); // the dialog was left for the trip
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    return () => { opener?.focus(); };
  }, []);
  const step = (name: string, s: Partial<Step>) => setSteps((x) => ({ ...x, [name]: { since: Date.now(), state: "run", ...x?.[name], ...s } }));
  const go = (id: string, drafted: Drafted) => { if (!gone.current) { gone.current = true; created(id, undefined, drafted); } };
  const make = async (withAi: boolean) => {
    setBusy(true); setErr("");
    let id: string;
    try { id = (await api.create(sv.newTripTitle, text.trim())).id; } catch { setBusy(false); setErr(sv.couldNotSave); return; }
    if (!withAi || !text.trim()) return created(id);
    try { await api.aiConsent(id); } catch { return created(id, sv.aiRun.errors.network); } // pressing "Skapa med AI" is the agreement (AI-64)
    const tripNow = async () => (await api.trips()).find((x) => x.id === id);
    const before = await tripNow().catch(() => undefined);
    const offered = await api.aiStatus(id).then((s) => DRAFT_HELPERS.filter((n) => s.helpers[n]?.available), () => []);
    step("draft", { state: "run" });
    offered.forEach((n) => step(n, { state: "wait" })); // all the steps from the start (AI-76)
    const r = await api.ai(id, "draft");
    if (!r.ok) return created(id, aiErrorText(r));
    if (!r.applied) return created(id, r.proposalIds.length ? sv.newTripAi.draftLater : sv.newTripAi.nothing);
    const after = await tripNow().catch(() => undefined);
    step("draft", { state: "done" });
    if (!before || !after) return created(id);
    const drafted = { before, after };
    setReady({ id, drafted });
    if (!offered.length) return go(id, drafted);
    offered.forEach((n) => step(n, { state: "run", since: Date.now() }));
    const added: Required<AiAdded> = { activities: 0, tasks: 0, bookings: 0, wishes: 0, info: 0, packing: 0 };
    const from = new Set<string>(); // AI-91
    await Promise.all(offered.map(async (n) => { // at the same time; what each one makes is applied as soon as it is done (AI-80)
      const h = await api.ai(id, n, { apply: true });
      if (h.ok) { helperDone(id); for (const k of Object.keys(added) as (keyof AiAdded)[]) added[k] += h.added?.[k] ?? 0; h.memoriesFrom?.forEach((x) => from.add(x)); }
      const n2 = h.ok ? (h.added ? h.added.activities + h.added.tasks + h.added.bookings + (h.added.info ?? 0) + (h.added.packing ?? 0) : h.proposalIds.length) : 0;
      step(n, h.ok ? { state: "done", note: sv.newTripAi.addedCount(n2) } : { state: "failed", note: aiErrorText(h) });
    }));
    go(id, drafted); // all done: to the trip by itself
    allDone(id, added, [...from]);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void make(ai); };
  return (
    <dialog ref={ref} aria-label={steps ? sv.newTripAi.working : sv.newTripAi.title} onCancel={(e) => { if (busy && !ready) e.preventDefault(); }}
      onClose={() => { if (ready) go(ready.id, ready.drafted); else if (!busy) close(); }}>
      {steps ? <Working text={text.trim()} steps={steps} goTrip={ready ? () => go(ready.id, ready.drafted) : undefined} /> : <>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} disabled={busy} /></span>
      <h3>{sv.newTripAi.title}</h3>
      <form onSubmit={submit}>
        <label>{sv.newTripAi.label}<textarea rows={6} maxLength={2000} value={text} placeholder={sv.newTripAi.example} onChange={(e) => setText(e.target.value)} disabled={busy} autoFocus /></label>
        <p className="ro note">{ai ? sv.newTripAi.aiNote : sv.newTripAi.note} {ai && <a className="place" href="/ai.html" target="_blank" rel="noopener noreferrer">{sv.newTripAi.howTo}</a> /* UI-23 */}</p>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="dlgbar">
          <button className="btn" type="submit" disabled={busy || (ai && !text.trim())}>{ai ? sv.newTripAi.makeAi : sv.newTripAi.make}</button>
          {ai && <button className="btn ghost" type="button" disabled={busy} onClick={() => void make(false)}>{sv.newTripAi.makeEmpty}</button>}
        </div>
      </form></>}
    </dialog>
  );
}

/** AI-76: the real steps as a checklist: a spinner and the seconds on a running step, a tick on a finished one, the reason on a failed one;
 * after the draft a button to the trip while the helpers finish in the background. */
function Working({ text, steps, goTrip }: { text: string; steps: Record<string, Step>; goTrip?: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(i); }, []);
  return <div className="working" role="status" aria-live="polite">
    <h3>{sv.newTripAi.working}</h3>
    <blockquote className="manifest">{text}</blockquote>
    <ol className="steps">{(["draft", ...DRAFT_HELPERS] as string[]).filter((n) => steps[n]).map((n) => { const s = steps[n]!; return (
      <li key={n} className={`step ${s.state}`}>
        <span className="mark" aria-hidden="true">{s.state === "run" ? <span className="spinner" /> : s.state === "wait" ? null : <Icon name={s.state === "done" ? "check" : "close"} />}</span>
        <span>{sv.newTripAi.steps[n]}<span className="sr"> {sv.newTripAi.stepState[s.state]}</span>
          {s.state === "run" && <small className="ro" aria-hidden="true"> {sv.newTripAi.seconds(Math.round((Date.now() - s.since) / 1000))}</small>}
          {s.note && <small className="ro"> · {s.note}</small>}</span>
      </li>); })}</ol>
    {goTrip ? <><p className="ro note">{sv.newTripAi.background}</p>
      <div className="dlgbar"><button className="btn" type="button" onClick={goTrip} autoFocus>{sv.newTripAi.goTrip}</button></div></>
      : <p className="ro note">{sv.newTripAi.busy}</p>}
  </div>;
}
