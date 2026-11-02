// A new trip from "Beskriv din dröm" (AI-10): the description becomes the purpose as written, and with AI a draft of the trip
// comes as a proposal to review in Nåla. Without AI the trip is made with the purpose only.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./api.ts";
import { aiErrorText } from "./format.ts";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";

export function NewTripDialog({ ai, created, close }: { ai: boolean; created: (id: string, notice?: string) => void; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
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
    const r = await api.ai(id, "draft");
    created(id, r.ok ? (r.proposalIds.length ? sv.newTripAi.ready : sv.newTripAi.nothing) : aiErrorText(r));
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void make(ai); };
  return (
    <dialog ref={ref} aria-label={sv.newTripAi.title} onClose={() => { if (!busy) close(); }}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} disabled={busy} /></span>
      <h3>{sv.newTripAi.title}</h3>
      <form onSubmit={submit}>
        <label>{sv.newTripAi.label}<textarea rows={6} maxLength={2000} value={text} placeholder={sv.newTripAi.example} onChange={(e) => setText(e.target.value)} disabled={busy} autoFocus /></label>
        <p className="ro note">{ai ? sv.newTripAi.aiNote : sv.newTripAi.note}</p>
        {err && <p className="err" role="alert">{err}</p>}
        {busy && ai && <p className="ro" role="status">{sv.newTripAi.busy}</p>}
        <div className="dlgbar">
          <button className="btn" type="submit" disabled={busy || (ai && !text.trim())}>{ai ? sv.newTripAi.makeAi : sv.newTripAi.make}</button>
          {ai && <button className="btn ghost" type="button" disabled={busy} onClick={() => void make(false)}>{sv.newTripAi.makeEmpty}</button>}
        </div>
      </form>
    </dialog>
  );
}
