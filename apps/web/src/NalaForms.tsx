// Dialog forms for editing the plan (ED-01..ED-11). The changes themselves are built in edit.ts.
import { useState, type ChangeEvent, type ReactNode } from "react";
import type { Op, Trip } from "@trip/schema";
import {
  daysOutside, removeActivity, removeBooking, removeBudgetItem, removeInfo, removePlace, removeTask,
  saveActivity, saveBooking, saveBudgetItem, saveDay, saveInfo, savePlace, saveTask, saveTrip, setTripDates, tripRange,
  type BookingInput, type Result,
} from "./edit.ts";
import { geocode } from "./weather.ts";
import { IconButton } from "./Icons.tsx";
import { CATEGORIES } from "./categories.ts";
import { suggestPurpose } from "./purpose.ts";
import { shortDate } from "./format.ts";
import { activityMissing } from "./schedule.ts";
import { fmtDuration } from "./transport.ts";

const DURATIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600];
import { sv } from "./sv.ts";

import type { EditDlg } from "./editKinds.ts";
export type { EditDlg };
/** Sends the ops; resolves to an error text, or null when saved. */
export type Save = (ops: Op[], reason: string) => Promise<string | null>;
type Props = { t: Trip; save: Save; close: () => void };

type Change = ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
function useFields<T extends Record<string, string | boolean>>(init: T) {
  const [f, set] = useState(init);
  const text = (k: keyof T) => ({ value: f[k] as string, onChange: (e: Change) => set((o) => ({ ...o, [k]: e.target.value })) });
  const check = (k: keyof T) => ({ checked: f[k] as boolean, onChange: (e: ChangeEvent<HTMLInputElement>) => set((o) => ({ ...o, [k]: e.target.checked })) });
  const setValue = (k: keyof T, v: string | boolean) => set((o) => ({ ...o, [k]: v }));
  return { f, text, check, set: setValue };
}

function useSave({ save, close }: Props) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (r: Result, reason: string) => {
    if (!r.ok) return setErr(r.error);
    setBusy(true);
    const e = await save(r.ops, reason);
    setBusy(false);
    if (e) setErr(e); else close(); // ED-10: a rejected change keeps the form open
  };
  const remove = (ops: Op[], reason: string) => { if (confirm(sv.confirmRemove)) submit({ ok: true, ops }, reason); }; // ED-09
  return { err, busy, submit, remove };
}

function Form({ title, err, busy, close, onSubmit, onRemove, children }: {
  title: string; err: string; busy: boolean; close: () => void; onSubmit: () => void; onRemove?: () => void; children: ReactNode;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <h3>{title}</h3>
      {children}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="dlgbar">
        <button className="btn" type="submit" disabled={busy}>{sv.save}</button>
        {onRemove && <IconButton icon="trash" look="red" tip="up" label={sv.remove} onClick={onRemove} />}
      </div>
    </form>
  );
}

function TripForm(p: Props) {
  const s = useSave(p);
  const { f, text, set } = useFields({ title: p.t.title, purpose: p.t.purpose });
  const suggestion = suggestPurpose(p.t); // MT-11: the plan proposes the purpose, the user decides
  return (
    <Form title={sv.editTrip} {...s} close={p.close} onSubmit={() => s.submit(saveTrip(p.t, f), "edit trip")}>
      <label>{sv.title}<input {...text("title")} autoFocus /></label>
      <div className="lblrow">
        <label htmlFor="purpose">{sv.purpose}</label>
        {suggestion && <IconButton icon="sparkle" look="bare" tip="left" label={sv.suggestPurpose} onClick={() => set("purpose", suggestion)} />}
      </div>
      <textarea id="purpose" rows={4} {...text("purpose")} />
      <p className="ro note">{suggestion ? sv.purposeHint : sv.noPurposeYet}</p>
    </Form>
  );
}

/** First and last date of the trip; days follow the dates (ED-14). Removing days asks first (ED-09). */
function DatesForm(p: Props) {
  const s = useSave(p);
  const r = tripRange(p.t);
  const { f, text } = useFields({ from: r?.from ?? "", to: r?.to ?? "" });
  const submit = () => {
    const res = setTripDates(p.t, f);
    const gone = res.ok ? daysOutside(p.t, f.from, f.to) : [];
    if (gone.length && !confirm([sv.confirmRemoveDays, ...gone.map((d) => `${shortDate(d.date)} ${d.title}`)].join("\n"))) return;
    s.submit(res, "trip dates");
  };
  return (
    <Form title={sv.editDates} {...s} close={p.close} onSubmit={submit}>
      <div className="two">
        <label>{sv.firstDay}<input type="date" {...text("from")} autoFocus /></label>
        <label>{sv.lastDay}<input type="date" {...text("to")} /></label>
      </div>
      <p className="ro note">{sv.datesHint}</p>
    </Form>
  );
}

/** Changes an existing day; its date is set by the trip's dates (ED-02, ED-14). */
function DayForm(p: Props & { id?: string }) {
  const s = useSave(p);
  const d = p.t.days.find((x) => x.id === p.id);
  const { f, text, check } = useFields({
    date: d?.date ?? "", title: d?.title ?? "", summary: d?.summary ?? "", icons: d?.icons.join("") ?? "",
    start: d?.start ?? "09:00", end: d?.end ?? "18:00",
    startEstimated: d?.startEstimated ?? d?.estimated ?? false, endEstimated: d?.endEstimated ?? d?.estimated ?? false,
    location: d?.location ?? "",
  });
  const submit = async () => {
    const loc = f.location.trim();
    // ED-04: look up coordinates only when the place changed
    const weather = loc === (d?.location ?? "") ? undefined : loc ? await geocode(loc) : null;
    s.submit(saveDay(p.t, { ...f, weather }, p.id), p.id ? "edit day" : "add day");
  };
  return (
    <Form title={sv.editDay} {...s} close={p.close} onSubmit={submit}>
      {d && <p className="ro">{sv.date}: {shortDate(d.date)}</p>}
      <label>{sv.title}<input {...text("title")} autoFocus /></label>
      <label>{sv.summaryLabel}<input {...text("summary")} /></label>
      <label>{sv.icons}<input {...text("icons")} /></label>
      <div className="two">
        <div><label>{sv.start}<input type="time" {...text("start")} /></label><label className="check"><input type="checkbox" {...check("startEstimated")} />{sv.estimate}</label></div>
        <div><label>{sv.end}<input type="time" {...text("end")} /></label><label className="check"><input type="checkbox" {...check("endEstimated")} />{sv.estimate}</label></div>
      </div>
      <label>{sv.location}<input {...text("location")} /></label>
    </Form>
  );
}

function ActivityForm(p: Props & { dayId: string; id?: string }) {
  const s = useSave(p);
  const a = p.t.days.find((x) => x.id === p.dayId)?.activities.find((x) => x.id === p.id);
  const { f, text, check } = useFields({
    start: a?.start ?? "", estimated: a?.estimated ?? false, text: a?.text ?? "", place: a?.placeIds[0] ?? "", placeName: "", address: "",
    category: a?.category ?? "", duration: String(a?.durationMin ?? ""), note: a?.note ?? "",
  });
  const place = f.place === "__new" ? { kind: "new" as const, name: f.placeName, address: f.address }
    : f.place ? { kind: "existing" as const, id: f.place } : { kind: "none" as const };
  return (
    <Form title={p.id ? sv.editActivity : sv.newActivity} {...s} close={p.close}
      onSubmit={() => {
        const durationMin = Number(f.duration) || undefined;
        const miss = f.text.trim() ? activityMissing({ start: f.start, durationMin, category: f.category }) : null; // ED-15; saveActivity reports a missing text
        s.submit(miss ? { ok: false, error: miss } : saveActivity(p.t, p.dayId, { start: f.start, estimated: f.estimated, text: f.text, place, category: f.category, durationMin, note: f.note }, p.id), p.id ? "edit activity" : "add activity");
      }}
      onRemove={p.id ? () => s.remove(removeActivity(p.t, p.dayId, p.id!), "remove activity") : undefined}>
      <label>{sv.what}<input {...text("text")} autoFocus /></label>
      <label>{sv.activityNote}<input {...text("note")} /></label>
      <div className="two">
        <label>{sv.time}<input type="time" {...text("start")} /></label>
        <label className="check"><input type="checkbox" {...check("estimated")} />{sv.estimate}</label>
      </div>
      <label>{sv.duration}<select {...text("duration")}>
        <option value="">{sv.chooseDuration}</option>
        {[...new Set([...DURATIONS, ...(a?.durationMin ? [a.durationMin] : [])])].sort((x, y) => x - y).map((m) => <option key={m} value={m}>{fmtDuration(m)}</option>)}
      </select></label>
      <label>{sv.category}<select {...text("category")}>
        <option value="">{sv.noCategory}</option>
        {CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}
      </select></label>
      <label>{sv.placeLabel}<select {...text("place")}>
        <option value="">{sv.noPlace}</option>
        {p.t.places.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        <option value="__new">{sv.newPlace}</option>
      </select></label>
      {f.place === "__new" && <>
        <label>{sv.placeName}<input {...text("placeName")} /></label>
        <label>{sv.address}<input {...text("address")} /></label>
      </>}
    </Form>
  );
}

function BookingForm(p: Props & { id?: string }) {
  const s = useSave(p);
  const b = p.t.bookings.find((x) => x.id === p.id);
  const first = [...p.t.days].sort((x, y) => x.date.localeCompare(y.date))[0]?.date ?? "";
  const { f, text } = useFields({
    name: b?.name ?? "", from: b?.from ?? first, to: b?.to ?? first, status: b?.status ?? "ready", reference: b?.reference ?? "", placeId: b?.placeId ?? "",
    note: b?.note ?? "",
  });
  return (
    <Form title={p.id ? sv.editBooking : sv.newBooking} {...s} close={p.close}
      onSubmit={() => s.submit(saveBooking(p.t, f as BookingInput, p.id), p.id ? "edit booking" : "add booking")}
      onRemove={p.id ? () => s.remove(removeBooking(p.t, p.id!), "remove booking") : undefined}>
      <label>{sv.name}<input {...text("name")} autoFocus /></label>
      <div className="two">
        <label>{sv.firstDate}<input type="date" {...text("from")} /></label>
        <label>{sv.lastDate}<input type="date" {...text("to")} /></label>
      </div>
      <label>{sv.status}<select {...text("status")}>
        {(Object.keys(sv.statuses) as (keyof typeof sv.statuses)[]).map((k) => <option key={k} value={k}>{sv.statuses[k]}</option>)}
      </select></label>
      <label>{sv.reference}<input {...text("reference")} /></label>
      <label>{sv.placeLabel}<PlaceSelect t={p.t} bind={text("placeId")} /></label>
      <label>{sv.description}<textarea {...text("note")} /></label>
    </Form>
  );
}

function BudgetForm(p: Props & { id?: string }) {
  const s = useSave(p);
  const b = p.t.budget.find((x) => x.id === p.id);
  const { f, text, check } = useFields({
    category: b?.category ?? sv.budgetCategories[0], amount: b?.amount !== undefined ? String(b.amount).replace(".", ",") : "", paid: b?.paid ?? false, owner: b?.owner ?? "",
    estimate: b?.estimate ?? false, amountMax: b?.amountMax !== undefined ? String(b.amountMax).replace(".", ",") : "", currency: b?.currency ?? p.t.currency, note: b?.note ?? "",
  });
  const categories = [...new Set([...sv.budgetCategories, ...p.t.budget.map((x) => x.category)])];
  return (
    <Form title={p.id ? sv.editCost : sv.newCost} {...s} close={p.close}
      onSubmit={() => s.submit(saveBudgetItem(p.t, f, p.id), p.id ? "edit budget" : "add budget")}
      onRemove={p.id ? () => s.remove(removeBudgetItem(p.t, p.id!), "remove budget") : undefined}>
      <label>{sv.category}<select {...text("category")} autoFocus>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label>{sv.description}<input {...text("note")} /></label>
      <div className="two">
        <label>{sv.amount.replace(" (kr)", "")}<input inputMode="decimal" {...text("amount")} /></label>
        <label>{sv.currency}<select {...text("currency")}>{sv.currencies.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <label className="check"><input type="checkbox" {...check("estimate")} />{sv.estimateLabel}</label>
      {f.estimate && <label>{sv.amountMax}<input inputMode="decimal" {...text("amountMax")} /></label>}
      <label className="check"><input type="checkbox" {...check("paid")} />{sv.paidMark}</label>
      <label>{sv.owner}<input list="owners" {...text("owner")} /></label>
      <datalist id="owners">{p.t.travelers.map((x) => <option key={x.id} value={x.name} />)}</datalist>
    </Form>
  );
}

const PlaceSelect = ({ t, bind }: { t: Trip; bind: { value: string; onChange: (e: Change) => void } }) => (
  <select {...bind}>
    <option value="">{sv.noPlace}</option>
    {t.places.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
  </select>
);

function TaskForm(p: Props & { id?: string }) {
  const s = useSave(p);
  const k = p.t.tasks.find((x) => x.id === p.id);
  const { f, text } = useFields({ text: k?.text ?? "", due: k?.due ?? "", placeId: k?.placeId ?? "" });
  return (
    <Form title={p.id ? sv.editTask : sv.newTask} {...s} close={p.close}
      onSubmit={() => s.submit(saveTask(p.t, f, p.id), p.id ? "edit task" : "add task")}
      onRemove={p.id ? () => s.remove(removeTask(p.t, p.id!), "remove task") : undefined}>
      <label>{sv.what}<input {...text("text")} autoFocus /></label>
      <label>{sv.due}<input type="date" {...text("due")} /></label>
      <label>{sv.placeLabel}<PlaceSelect t={p.t} bind={text("placeId")} /></label>
    </Form>
  );
}

function PlaceForm(p: Props & { id?: string }) {
  const s = useSave(p);
  const x = p.t.places.find((y) => y.id === p.id);
  const { f, text } = useFields({
    name: x?.name ?? "", address: x?.address ?? "", phone: x?.phone ?? "", notes: x?.notes ?? "",
    website: x?.website ?? "", bookingUrl: x?.bookingUrl ?? "", bookingLabel: x?.bookingLabel ?? "",
  });
  return (
    <Form title={p.id ? sv.editPlace : sv.placeNew} {...s} close={p.close}
      onSubmit={() => s.submit(savePlace(p.t, f, p.id), p.id ? "edit place" : "add place")}
      onRemove={p.id ? () => s.remove(removePlace(p.t, p.id!), "remove place") : undefined}>
      <label>{sv.placeName}<input {...text("name")} autoFocus /></label>
      <label>{sv.address}<input {...text("address")} /></label>
      <label>{sv.phone}<input type="tel" {...text("phone")} /></label>
      <label>{sv.notes}<textarea {...text("notes")} /></label>
      <label>{sv.website}<input inputMode="url" {...text("website")} /></label>
      <label>{sv.bookingUrl}<input inputMode="url" {...text("bookingUrl")} /></label>
      {f.bookingUrl.trim() && <label>{sv.bookingLabel}<input {...text("bookingLabel")} /></label>}
    </Form>
  );
}

function InfoForm(p: Props & { id?: string }) {
  const s = useSave(p);
  const x = p.t.info.find((y) => y.id === p.id);
  const { f, text, check } = useFields({ title: x?.title ?? "", text: x?.text ?? "", placeId: x?.placeId ?? "", unsuitable: x?.unsuitable ?? "", verify: x?.verify ?? false });
  return (
    <Form title={p.id ? sv.editInfo : sv.newInfo} {...s} close={p.close}
      onSubmit={() => s.submit(saveInfo(p.t, f, p.id), p.id ? "edit info" : "add info")}
      onRemove={p.id ? () => s.remove(removeInfo(p.t, p.id!), "remove info") : undefined}>
      <label>{sv.title}<input {...text("title")} autoFocus /></label>
      <label>{sv.description}<textarea {...text("text")} /></label>
      <label>{sv.placeLabel}<PlaceSelect t={p.t} bind={text("placeId")} /></label>
      <label>{sv.unsuitableLabel}<input {...text("unsuitable")} /></label>
      <label className="check"><input type="checkbox" {...check("verify")} />{sv.verifyLabel}</label>
    </Form>
  );
}

export function EditDialog({ dlg, ...p }: Props & { dlg: EditDlg }) {
  switch (dlg.kind) {
    case "trip": return <TripForm {...p} />;
    case "dates": return <DatesForm {...p} />;
    case "day": return <DayForm {...p} id={dlg.id} />;
    case "activity": return <ActivityForm {...p} dayId={dlg.dayId} id={dlg.id} />;
    case "booking": return <BookingForm {...p} id={dlg.id} />;
    case "budget": return <BudgetForm {...p} id={dlg.id} />;
    case "task": return <TaskForm {...p} id={dlg.id} />;
    case "placeEdit": return <PlaceForm {...p} id={dlg.id} />;
    case "info": return <InfoForm {...p} id={dlg.id} />;
  }
}
