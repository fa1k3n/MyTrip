// Nåla in edit mode: drag and drop of activities, and gap and clash rows (ED-15..ED-17). Loaded on demand (PF-01).
import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { Trip } from "@trip/schema";
import { moveActivity, scheduleRows } from "./schedule.ts";
import { fmtDuration } from "./transport.ts";
import { Icon, IconButton } from "./Icons.tsx";
import { ActivityText, ActivityWhen, type Activity, type Run } from "./TripView.tsx";
import type { EditDlg } from "./editKinds.ts";
import { sv } from "./sv.ts";

type Day = Trip["days"][number];

/** What an activity still lacks, shown in edit mode (ED-15). */
const missing = (a: Activity) => [!a.start && sv.missing.time, !a.durationMin && !a.end && sv.missing.duration, !a.category && sv.missing.category].filter(Boolean).join(", ");

/** The activity being dragged; shared by all day cards so an activity can move to another day (ED-16). */
let dragging: { dayId: string; id: string } | null = null;
const DRAG_TYPE = "application/x-trip-activity";

/** Nåla in edit mode: drag handles, and gap and clash rows between activities (ED-16, ED-17). */
export default function PlanActivities({ t, x, onPlace, edit, run }: { t: Trip; x: Day; onPlace: (id: string) => void; edit: (d: EditDlg) => void; run: Run }) {
  const [over, setOver] = useState<number | null>(null); // drop line above activity `over`; the list length means below the last
  const move = (dayId: string, id: string, index: number) =>
    run((cur) => moveActivity(cur, dayId, id, x.id, index), "move activity");
  const posFor = (e: DragEvent, i: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY > r.top + r.height / 2 ? i + 1 : i;
  };
  const onKey = (e: KeyboardEvent, i: number, a: Activity) => { // keyboard alternative to dragging (AC-*)
    const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
    if (to === null) return;
    e.preventDefault();
    if (to >= 0 && to < x.activities.length) move(x.id, a.id, to);
  };
  const drop = (e: DragEvent, pos: number) => {
    e.preventDefault(); e.stopPropagation(); setOver(null);
    const d = dragging;
    dragging = null;
    if (!d) return;
    const from = d.dayId === x.id ? x.activities.findIndex((a) => a.id === d.id) : -1;
    if (from >= 0 && (pos === from || pos === from + 1)) return; // dropped where it already is
    move(d.dayId, d.id, from >= 0 && pos > from ? pos - 1 : pos); // moveActivity counts without the moved activity
  };
  const accept = (e: DragEvent) => { if (dragging || e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); };
  let n = -1;
  return (
    <div className="plan" onDragOver={(e) => { accept(e); if (!x.activities.length) setOver(0); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
      onDrop={(e) => drop(e, over ?? x.activities.length)}>
      {scheduleRows(x.activities).map((r) => {
        if (r.kind !== "act") return (
          <div key={`${r.kind}-${n}`} className={`slot ${r.kind}`} role="note">
            {r.kind === "clash" ? <><span aria-hidden="true">⚠</span> {sv.clash} {fmtDuration(r.min)}</> : <>{sv.gap} {fmtDuration(r.min)}</>}
          </div>
        );
        const a = r.a, i = ++n, miss = missing(a);
        return (
          <div key={a.id} className={`act drag ${over === i ? "over-top" : ""} ${over === i + 1 && i === x.activities.length - 1 ? "over-bottom" : ""}`}
            draggable onDragStart={(e) => { dragging = { dayId: x.id, id: a.id }; e.dataTransfer.setData(DRAG_TYPE, a.id); e.dataTransfer.effectAllowed = "move"; }}
            onDragEnd={() => { dragging = null; setOver(null); }}
            onDragOver={(e) => { accept(e); e.stopPropagation(); setOver(posFor(e, i)); }}
            onDrop={(e) => drop(e, posFor(e, i))}>
            <button type="button" className="btn ghost icon bare grip tip-right" aria-label={`${sv.moveActivity} ${a.text}`} data-tip={sv.moveHint} onKeyDown={(e) => onKey(e, i, a)}><Icon name="grip" /></button>
            <ActivityWhen a={a} />
            <span className="what-col"><ActivityText t={t} a={a} onPlace={onPlace} />{miss && <small className="miss">{sv.missing.label}: {miss}</small>}</span>
            <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${a.text}`} onClick={() => edit({ kind: "activity", dayId: x.id, id: a.id })} mut />
          </div>
        );
      })}
      {!x.activities.length && <p className={`ro drop ${over === 0 ? "over-top" : ""}`}>{sv.dropHere}</p>}
    </div>
  );
}
