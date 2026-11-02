// A new trip from "Beskriv din dröm" (AI-10): the description becomes the purpose as written, and with AI a draft of the trip
// comes as a proposal to review in Nåla. Without AI the trip is made with the purpose only.
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Trip } from "@trip/schema";
import { api } from "./api.ts";
import { draftSummary, readProposal, type Pending } from "./proposals.ts";
import { aiErrorText } from "./format.ts";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";

export function NewTripDialog({ ai, created, close }: { ai: boolean; created: (id: string, notice?: string, draft?: string) => void; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [working, setWorking] = useState(false); // AI-76: the AI service is making the draft
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    return () => { opener?.focus(); };
  }, []);
  const make = async (withAi: boolean) => {
    setBusy(true); setErr("");
    let id: string;
    try { id = (await api.create(sv.newTripTitle, text.trim())).id; } catch { setBusy(false); setErr(sv.couldNotSave); return; }
    if (!withAi || !text.trim()) return created(id);
    try { await api.aiConsent(id); } catch { return created(id, sv.aiRun.errors.network); } // pressing "Skapa med AI" is the agreement (AI-64)
    setWorking(true);
    const r = await api.ai(id, "draft");
    created(id, r.ok ? (r.proposalIds.length ? undefined : sv.newTripAi.nothing) : aiErrorText(r), r.ok ? r.proposalIds[0] : undefined);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void make(ai); };
  return (
    <dialog ref={ref} aria-label={working ? sv.newTripAi.working : sv.newTripAi.title} onCancel={(e) => { if (busy) e.preventDefault(); }} onClose={() => { if (!busy) close(); }}>
      {working ? <Working text={text.trim()} /> : <>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} disabled={busy} /></span>
      <h3>{sv.newTripAi.title}</h3>
      <form onSubmit={submit}>
        <label>{sv.newTripAi.label}<textarea rows={6} maxLength={2000} value={text} placeholder={sv.newTripAi.example} onChange={(e) => setText(e.target.value)} disabled={busy} autoFocus /></label>
        <p className="ro note">{ai ? sv.newTripAi.aiNote : sv.newTripAi.note}</p>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="dlgbar">
          <button className="btn" type="submit" disabled={busy || (ai && !text.trim())}>{ai ? sv.newTripAi.makeAi : sv.newTripAi.make}</button>
          {ai && <button className="btn ghost" type="button" disabled={busy} onClick={() => void make(false)}>{sv.newTripAi.makeEmpty}</button>}
        </div>
      </form></>}
    </dialog>
  );
}

/** AI-76: while the draft is made: a calm spinner, the seconds that have passed and the description being worked on. */
function Working({ text }: { text: string }) {
  const [s, setS] = useState(0);
  useEffect(() => { const i = setInterval(() => setS((n) => n + 1), 1000); return () => clearInterval(i); }, []);
  return <div className="working" role="status" aria-live="polite">
    <h3>{sv.newTripAi.working}</h3>
    <div className="spinner" aria-hidden="true" />
    <p className="ro">{sv.newTripAi.busy} <span aria-hidden="true">{sv.newTripAi.seconds(s)}</span></p>
    <blockquote className="manifest">{text}</blockquote>
  </div>;
}

/** AI-75: the draft of a trip just made with AI, over Nåla: title, travelers and days in words, to use or to start empty.
 * Closing keeps it as a proposal in Nåla's list. */
export function DraftDialog({ t, pid, approve, reject, close }: {
  t: Trip; pid: string; approve: (pid: string) => Promise<string | null>; reject: (pid: string) => Promise<void>; close: (later: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [p, setP] = useState<Pending | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    return () => { opener?.focus(); };
  }, []);
  useEffect(() => {
    api.proposals(t.id).then((ps) => { const x = (ps as unknown as Pending[]).find((y) => y.id === pid && y.status === "pending"); if (x) setP(x); else close(false); }, () => close(false));
  }, [t.id, pid]); // eslint-disable-line react-hooks/exhaustive-deps -- once per draft
  const next = p && readProposal(t, p).next;
  const s = next && draftSummary(next);
  const act = async (use: boolean) => {
    setBusy(true); setErr("");
    if (use) { const e = await approve(pid); if (e) { setErr(e); setBusy(false); return; } } else await reject(pid);
    close(false);
  };
  return (
    <dialog ref={ref} aria-label={sv.newTripAi.draftTitle} onClose={() => close(true)}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={() => close(true)} disabled={busy} /></span>
      <h3>{sv.newTripAi.draftTitle}</h3>
      {!s ? <p className="ro">{sv.loading}</p> : <>
        <p className="ro">{p!.reason || sv.newTripAi.draftLead}</p>
        <p><b>{s.title}</b></p>
        <h4>{sv.newTripAi.draftTravelers}</h4>
        <ul className="asklist">{s.travelers.map((x) => <li key={x}>{x}</li>)}</ul>
        <h4>{sv.newTripAi.draftDays}</h4>
        <ul className="asklist">{s.days.map((x) => <li key={x}>{x}</li>)}</ul>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="dlgbar">
          <button className="btn" type="button" disabled={busy} onClick={() => void act(true)}>{sv.newTripAi.useDraft}</button>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void act(false)}>{sv.newTripAi.emptyDraft}</button>
        </div>
      </>}
    </dialog>
  );
}
