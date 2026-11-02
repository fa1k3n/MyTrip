// The superuser's view of the beta (US-27, US-29): the feedback sent with "Tyck till" and how each trip is used.
import { useEffect, useState, type FormEvent } from "react";
import { api, type FeedbackNote, type TripUsage } from "./api.ts";
import { aiCostLine } from "./format.ts";
import { sv } from "./sv.ts";

const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const PAGE: Record<string, string> = { dr: sv.tabs.dr, nala: sv.tabs.nala, up: sv.tabs.up, mi: sv.tabs.mi, portal: sv.hub, settings: sv.settings, admin: sv.tripSettings };

export function BetaNotes() {
  const [notes, setNotes] = useState<FeedbackNote[] | null>(null);
  useEffect(() => { api.notes().then(setNotes, () => setNotes([])); }, []);
  return <div className="card"><h3>{sv.beta.notes}</h3>
    {notes && !notes.length && <p className="ro">{sv.beta.noNotes}</p>}
    {notes?.map((n) => <div className="note-row" key={n.id}>
      <p className="ro"><b>{n.name}</b> · {when(n.at)} · {sv.beta.page(PAGE[n.page] ?? n.page)}</p>
      <p>{n.text}</p>
      <Answer n={n} />
    </div>)}
  </div>;
}

/** US-34: the superuser's answer to a note, which its writer reads in "Tyck till". */
function Answer({ n }: { n: FeedbackNote }) {
  const [text, setText] = useState(n.reply ?? ""), [state, setState] = useState<"" | "saved" | "failed">("");
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try { await api.reply(n.id, text); setState("saved"); } catch { setState("failed"); }
  };
  return <form className="answerform" onSubmit={save}>
    <label>{sv.beta.answerLabel(n.name)}<textarea rows={2} maxLength={1000} value={text} onChange={(e) => { setText(e.target.value); setState(""); }} /></label>
    <button className="btn ghost" type="submit" disabled={text.trim() === (n.reply ?? "")}>{sv.beta.answerSave}</button>
    {state === "saved" && <span className="ro" role="status">{sv.beta.answerSaved}</span>}
    {state === "failed" && <span className="err" role="alert">{sv.beta.answerFailed}</span>}
  </form>;
}

export function BetaUsage() {
  const [rows, setRows] = useState<TripUsage[] | null>(null);
  useEffect(() => { api.usage().then(setRows, () => setRows([])); }, []);
  const tabs = ["dr", "nala", "up", "mi"] as const;
  return <div className="card"><h3>{sv.beta.usage}</h3>
    <p className="ro note">{sv.beta.usageLead}</p>
    {rows && !rows.some((r) => r.people.length) && <p className="ro">{sv.beta.noUsage}</p>}
    {rows?.filter((r) => r.people.length).map((r) => <div className="usage" key={r.tripId}>
      <p><b>{r.title}</b> <span className="ro">· {r.owner}{r.from ? ` · ${r.from}–${r.to}` : ""} · {sv.beta.memories(r.memories)}</span></p>
      <div className="tablewrap"><table>
        <thead><tr><th scope="col">{sv.name}</th>{tabs.map((k) => <th scope="col" key={k}>{sv.tabs[k]}</th>)}<th scope="col">{sv.beta.upDuring}</th><th scope="col">{sv.beta.changes}</th></tr></thead>
        <tbody>{r.people.map((p) => <tr key={p.name}><th scope="row">{p.name}</th>{tabs.map((k) => <td key={k}>{p.days[k]}</td>)}<td>{p.upDuring}</td><td>{p.changes}</td></tr>)}</tbody>
      </table></div>
      {!!r.ai?.length && <p className="ro note">{sv.aiRun.costTitle}: {r.ai.map(aiCostLine).join(" · ")}</p>}
    </div>)}
  </div>;
}
