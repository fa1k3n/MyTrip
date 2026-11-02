// "Tyck till" during the beta (US-27): a short note to the one who runs Basläger, with the page it was written on.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./api.ts";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";

export function FeedbackDialog({ page, tripId, close }: { page: string; tripId?: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(""), [state, setState] = useState<"" | "busy" | "sent" | "failed">("");
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    return () => { opener?.focus(); };
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("busy");
    try { await api.feedback(text, page, tripId); setState("sent"); setText(""); } catch { setState("failed"); }
  };
  return (
    <dialog ref={ref} aria-label={sv.beta.feedback} onClose={close}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} /></span>
      <h3>{sv.beta.title} <span className="betatag inline">{sv.beta.tag}</span></h3>
      <p className="ro">{sv.beta.lead}</p>
      <form onSubmit={submit}>
        <label>{sv.beta.label}<textarea rows={5} maxLength={2000} value={text} onChange={(e) => { setText(e.target.value); if (state === "sent") setState(""); }} autoFocus /></label>
        <p className="ro note">{sv.beta.goes}</p>
        {state === "sent" && <p className="ro" role="status">{sv.beta.sent}</p>}
        {state === "failed" && <p className="err" role="alert">{sv.beta.failed}</p>}
        <button className="btn" type="submit" disabled={!text.trim() || state === "busy"}>{sv.beta.send}</button>
      </form>
    </dialog>
  );
}
