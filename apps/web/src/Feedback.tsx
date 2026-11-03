// "Tyck till" during the beta (US-27): a short note to the one who runs Basläger, with the page it was written on.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type MyNote } from "./api.ts";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";
import { APP_VERSION } from "./version.ts";
import { onOutside } from "./outside.ts";

const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function FeedbackDialog({ page, tripId, close }: { page: string; tripId?: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(""), [state, setState] = useState<"" | "busy" | "sent" | "failed">("");
  const [mine, setMine] = useState<MyNote[]>([]); // US-34: one's own notes with their answers
  useEffect(() => { api.myNotes().then(setMine, () => {}); }, [state]);
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    return () => { opener?.focus(); };
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("busy");
    try { await api.feedback(text, page, tripId, APP_VERSION); setState("sent"); setText(""); } catch { setState("failed"); }
  };
  return (
    <dialog ref={ref} aria-label={sv.beta.feedback} onClose={close} onClick={onOutside(close)}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} /></span>
      <h3>{sv.beta.title} <span className="betatag inline">{sv.beta.tag}</span></h3>
      <p className="ro">{sv.beta.lead}</p>
      <form onSubmit={submit}>
        <label>{sv.beta.label}<textarea rows={5} maxLength={2000} value={text} onChange={(e) => { setText(e.target.value); if (state === "sent") setState(""); }} autoFocus /></label>
        <p className="ro note">{sv.beta.goes} {sv.beta.version(APP_VERSION)}.</p>
        {state === "sent" && <p className="ro" role="status">{sv.beta.sent}</p>}
        {state === "failed" && <p className="err" role="alert">{sv.beta.failed}</p>}
        <button className="btn" type="submit" disabled={!text.trim() || state === "busy"}>{sv.beta.send}</button>
      </form>
      {!!mine.length && <section className="mynotes" aria-label={sv.beta.mine}><h4>{sv.beta.mine}</h4>
        {mine.map((n) => <div className="note-row" key={n.id}>
          <p className="ro">{when(n.at)}</p><p>{n.text}</p>
          {n.reply && <p className="answer"><b>{sv.beta.answer}:</b> {n.reply}</p>}
        </div>)}
      </section>}
    </dialog>
  );
}
