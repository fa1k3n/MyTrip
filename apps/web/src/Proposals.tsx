// Proposals from an LLM client or the AI, reviewed in Nåla (MC-15..MC-19). Loaded on demand (PF-01).
import { useEffect, useState } from "react";
import type { Trip } from "@trip/schema";
import { api } from "./api.ts";
import { llmProposals, previewMarks, readProposal, type Mark, type Pending } from "./proposals.ts";
import { scheduleRows } from "./schedule.ts";
import { fmtDuration } from "./transport.ts";
import { stampText } from "./offline.ts";
import { ask } from "./Ask.tsx";
import { IconButton } from "./Icons.tsx";
import { ActivityText, ActivityWhen, PinMark, type Activity } from "./TripView.tsx";
import { sv } from "./sv.ts";

type Day = Trip["days"][number];
export type DayMarks = { marks: Map<string, Mark>; removed: Activity[] };
export type Preview = { id: string; next: Trip; marks: Map<string, DayMarks> };

const badge = { add: sv.proposal.added, change: sv.proposal.changed, remove: sv.proposal.removed };

/** A day as the proposal would leave it, read only: new and changed activities marked, removed ones struck through,
 * and gaps and clashes counted on the result (MC-17, ED-17). */
export function PreviewActivities({ t, x, m, onPlace }: { t: Trip; x: Day; m?: DayMarks; onPlace: (id: string) => void }) {
  let n = 0;
  return <div className="plan preview">
    {scheduleRows(x.activities).map((r) => {
      if (r.kind !== "act") return <div key={`${r.kind}-${n}`} className={`slot ${r.kind}`} role="note">
        {r.kind === "clash" ? <><span aria-hidden="true">⚠</span> {sv.clash} {fmtDuration(r.min)}</> : <>{sv.gap} {fmtDuration(r.min)}</>}</div>;
      n++;
      const mark = m?.marks.get(r.a.id);
      return <div key={r.a.id} className={`act ${mark ? `prop-${mark}` : ""}`}>
        <ActivityWhen a={r.a} />{r.a.pinned && <PinMark />}<ActivityText t={t} a={r.a} onPlace={onPlace} />{mark && <span className={`propmark ${mark}`}>{badge[mark]}</span>}
      </div>;
    })}
    {m?.removed.map((a) => <div key={`rm-${a.id}`} className="act prop-remove">
      <ActivityWhen a={a} /><ActivityText t={t} a={a} onPlace={onPlace} /><span className="propmark remove">{badge.remove}</span>
    </div>)}
  </div>;
}

/** The card "Förslag" above Nåla's days, for a Planerare and the superuser, shown while proposals wait (MC-15, MC-19). */
export default function Proposals({ t, approve, reject, preview, setPreview }: {
  t: Trip; approve: (pid: string) => Promise<string | null>; reject: (pid: string) => Promise<void>;
  preview: Preview | null; setPreview: (p: Preview | null) => void;
}) {
  const [list, setList] = useState<Pending[]>([]);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    api.proposals(t.id).then((ps) => { if (live) setList(llmProposals(ps as Pending[])); }, () => {});
    return () => { live = false; };
  }, [t.id, t.revision]); // again after each change, e.g. an approval
  if (!list.length) return null;
  const yes = async (pid: string) => {
    setBusy(pid);
    const e = await approve(pid);
    setBusy("");
    setErr((o) => ({ ...o, [pid]: e ?? "" }));
    if (!e && preview?.id === pid) setPreview(null);
  };
  const no = async (pid: string) => {
    if (!(await ask(sv.proposal.rejectAsk, { ok: sv.askOk.reject }))) return;
    if (preview?.id === pid) setPreview(null);
    await reject(pid);
  };
  return (
    <section className="card proposals" aria-label={sv.proposal.title}>
      <h3>{sv.proposal.title} <small className="ro">{sv.proposal.waiting(list.length)}</small></h3>
      {list.map((p) => {
        const r = readProposal(t, p), showing = preview?.id === p.id;
        const may = !r.stale && !r.problems.length && r.changes.length > 0;
        return (
          <div className={`prop ${showing ? "on" : ""}`} key={p.id}>
            <div className="row mid">
              <span><b>{p.reason || sv.proposal.title}</b><br /><small className="ro">{sv.proposal.made(stampText(p.at, new Date(), t.timezone))}</small></span>
              <span className="end">
                {r.next && r.changes.length > 0 && <IconButton icon="eye" look="bare" tip="left" label={showing ? sv.proposal.hide : sv.proposal.show} pressed={showing}
                  onClick={() => setPreview(showing ? null : { id: p.id, next: r.next!, marks: previewMarks(t, r.next!) })} />}
                {may && <IconButton icon="check" look="primary" tip="left" label={sv.proposal.approve} disabled={busy === p.id} onClick={() => yes(p.id)} />}
                <IconButton icon="close" look="bare" tip="left" label={sv.proposal.reject} disabled={busy === p.id} onClick={() => no(p.id)} />
              </span>
            </div>
            {r.stale && <p className="note warn" role="note">{sv.proposal.stale}</p>}
            {r.problems.length > 0 && <div className="err" role="alert">{sv.proposal.problems}<ul>{r.problems.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            {!r.problems.length && !r.changes.length && <p className="ro">{sv.proposal.none}</p>}
            {r.changes.length > 0 && <ul className="changes">{r.changes.map((c, i) => <li key={i} className={`ch-${c.kind}`}><span className={`propmark ${c.kind}`}>{badge[c.kind]}</span> {c.text}</li>)}</ul>}
            {showing && <p className="ro note">{sv.proposal.preview}</p>}
            {err[p.id] && <p className="err" role="alert">{err[p.id]}</p>}
          </div>
        );
      })}
    </section>
  );
}
