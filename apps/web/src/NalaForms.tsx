// Dialog forms for editing the plan (ED-01..ED-11). The changes themselves are built in edit.ts.
import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { BookingReading, Op, TicketFile, Trip } from "@trip/schema";
import {
  daysOutside, removeActivity, removeBooking, removeBudgetItem, removeInfo, removePlace, removeTask,
  saveActivity, travelInput, wishByDefault, saveBooking, saveBudgetItem, saveDay, saveInfo, savePlace, saveTask, saveTrip, saveBudgetMax, setTripDates, tripRange,
  readingToForm, ticketActivities, bookingForm, matchedForm, ticketActivityFor, toBookMatches, type BookingInput, type Result,
} from "./edit.ts";
import { lookupPlace } from "./weather.ts";
import { AiMark, Icon, IconButton } from "./Icons.tsx";
import { ACTIVITY_CATEGORIES, TIME_POINT } from "./categories.ts";
import { replaceNeedsAsk, suggestPurpose } from "./purpose.ts";
import { aiErrorText, dayLabel, dayTitle, shortDate } from "./format.ts";
import { activityMissing, defaultDuration, planWish, suggestStart } from "./schedule.ts";
import { CatIcon } from "./CatIcon.tsx";
import { pickedLabel } from "./hiddenView.ts";
import { svAdmin } from "./sv-admin.ts";
import { fmtDuration } from "./transport.ts";
import { readBooking } from "@trip/schema/src/mailbooking.ts";
import { api, type MailProposal } from "./api.ts";
import { checkPick } from "./tickets.ts";
import { MAX_NOTE, memoryOps, mineOf, saveAlbum } from "./memories.ts";
import { defaultSharers, rewishOps, splitOps, wishOf } from "./money.ts";
import { ActivityAndCategory } from "./ExpenseFields.tsx";

const DURATIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600];
import { sv } from "./sv.ts";
import { ask } from "./Ask.tsx"; // UI-11
import { removeAsk } from "./undo.ts";

import type { EditDlg } from "./editKinds.ts";
export type { EditDlg };
/** Sends the ops; resolves to an error text, or null when saved. */
export type Save = (ops: Op[], reason: string) => Promise<string | null>;
type Props = {
  t: Trip; save: Save; close: () => void; self?: string; // self: the traveler of a personal link (AU-18)
  approveMail?: (pid: string, ops: Op[]) => Promise<string | null>; rejectMail?: (pid: string) => Promise<void>; // BK-17
  mailToWish?: (pid: string) => Promise<void>; // BK-29
  aiRead?: boolean; // "Läs med AI" on a mail proposal (AI-60)
  wishes?: boolean; // the role may change wishes, so a new activity can make one (ED-29)
};

type Change = ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
function useFields<T extends Record<string, string | boolean>>(init: T) {
  const [f, set] = useState(init);
  const text = (k: keyof T) => ({ value: f[k] as string, onChange: (e: Change) => set((o) => ({ ...o, [k]: e.target.value })) });
  const check = (k: keyof T) => ({ checked: f[k] as boolean, onChange: (e: ChangeEvent<HTMLInputElement>) => set((o) => ({ ...o, [k]: e.target.checked })) });
  const setValue = (k: keyof T, v: string | boolean) => set((o) => ({ ...o, [k]: v }));
  return { f, text, check, set: setValue };
}

function useSave({ t, save, close }: Props) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (r: Result, reason: string, send: (ops: Op[], reason: string) => Promise<string | null> = save) => {
    if (!r.ok) return setErr(r.error);
    setBusy(true);
    const e = await send(r.ops, reason);
    setBusy(false);
    if (e) setErr(e); else close(); // ED-10: a rejected change keeps the form open
  };
  const remove = async (ops: Op[], reason: string) => { if (await ask(removeAsk(t, ops))) submit({ ok: true, ops }, reason); }; // ED-09, ED-26
  return { err, busy, submit, remove, setErr };
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
        {suggestion && <IconButton icon="sparkle" look="bare" tip="left" label={sv.suggestPurpose} onClick={async () => { // MT-14: never replace own words without asking
          if (!replaceNeedsAsk(f.purpose, suggestion) || await ask(sv.replacePurposeAsk, { ok: sv.replacePurpose })) set("purpose", suggestion);
        }} />}
      </div>
      <textarea id="purpose" rows={4} {...text("purpose")} />
      <p className="ro note">{suggestion ? sv.purposeHint : sv.noPurposeYet}</p>
    </Form>
  );
}

/** The trip's maximum budget; empty removes it (BG-12). */
function BudgetMaxForm(p: Props) {
  const s = useSave(p);
  const { f, text } = useFields({ max: p.t.budgetMax !== undefined ? String(p.t.budgetMax).replace(".", ",") : "" });
  return (
    <Form title={sv.editBudgetMax} {...s} close={p.close} onSubmit={() => s.submit(saveBudgetMax(p.t, f.max), "budget max")}>
      <label>{sv.budgetMax} ({p.t.currency})<input {...text("max")} inputMode="decimal" autoFocus /></label>
      <p className="ro note">{sv.budgetMaxHint}</p>
    </Form>
  );
}

/** The link to the travelers' shared album; empty removes it (MI-20). */
function AlbumForm(p: Props) {
  const s = useSave(p);
  const { f, text } = useFields({ album: p.t.album ?? "" });
  return (
    <Form title={sv.minnas.albumLabel} {...s} close={p.close} onSubmit={() => s.submit(saveAlbum(p.t, f.album), "album")}>
      <label>{sv.minnas.albumLabel}<input {...text("album")} type="url" inputMode="url" placeholder="https://" autoFocus /></label>
      <p className="ro note">{sv.minnas.albumHint}</p>
    </Form>
  );
}

/** One traveler's comment on an experienced wish, for planning the next trip (MI-17, MI-18). */
function MemoryForm(p: Props & { dreamId: string; by: string }) {
  const s = useSave(p);
  const w = p.t.dreams.find((x) => x.id === p.dreamId);
  const { f, text } = useFields({ note: mineOf(p.t, p.dreamId, p.by)?.note ?? "" });
  return (
    <Form title={sv.minnas.write(w?.title ?? "")} {...s} close={p.close} onSubmit={() => s.submit(memoryOps(p.t, p.dreamId, p.by, { note: f.note }), "memory")}>
      <label>{sv.minnas.note}<input {...text("note")} maxLength={MAX_NOTE} autoFocus /></label>
      <p className="ro note">{sv.minnas.noteHint}</p>
    </Form>
  );
}

/** Who shares an expense, chosen per expense in Minnas > Budget (MI-25). */
function SplitForm(p: Props & { id: string }) {
  const s = useSave(p);
  const e = p.t.expenses.find((x) => x.id === p.id);
  const [picked, setPicked] = useState<string[]>(e && e.sharedBy.length ? e.sharedBy : defaultSharers(p.t.travelers) /* MI-38 */);
  const flip = (id: string) => setPicked((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  return (
    <Form title={sv.minnas.split(e?.text || sv.hiddenText)} {...s} close={p.close} onSubmit={() => s.submit(splitOps(p.t, p.id, picked), "split expense")}>
      <fieldset><legend>{sv.minnas.splitTitle}</legend>
        {p.t.travelers.map((x) => <label className="check" key={x.id}><input type="checkbox" checked={picked.includes(x.id)} onChange={() => flip(x.id)} />{x.name}</label>)}
      </fieldset>
    </Form>
  );
}

/** Which wish an expense belongs to, among all the trip's wishes, and its category, confirmed together (MI-41). */
function RelinkForm(p: Props & { id: string }) {
  const s = useSave(p);
  const e = p.t.expenses.find((x) => x.id === p.id);
  const [v, setV] = useState({ activity: e ? wishOf(p.t, e) ?? "" : "", category: e?.category ?? "" });
  if (!e) return null;
  return (
    <Form title={sv.minnas.relink(e.text || sv.hiddenText)} {...s} close={p.close} onSubmit={() => s.submit(rewishOps(p.t, p.id, v.activity, v.category), "rewish expense")}>
      <ActivityAndCategory choices={p.t.dreams.filter((d) => !d.hidden || d.id === v.activity).map((d) => ({ id: d.id, text: d.hidden ? sv.hiddenText : d.title, category: d.category }))}
        activity={v.activity} category={v.category}
        label={sv.up.wish} name="dream" onChange={setV} />
    </Form>
  );
}

/** Lägg på dag: a wish put last on a chosen day, the alternative to dragging it (DB-18). */
function PlanWishForm(p: Props & { id: string }) {
  const s = useSave(p);
  const w = p.t.dreams.find((x) => x.id === p.id);
  const days = [...p.t.days].sort((a, b) => a.date.localeCompare(b.date));
  const { f, text } = useFields({ day: days[0]?.id ?? "" });
  if (!w) return null;
  return (
    <Form title={sv.wish.toDayOf(w.title)} {...s} close={p.close} onSubmit={() => s.submit(planWish(p.t, w.id, f.day), "plan wish")}>
      <label>{sv.wish.day}<select {...text("day")} autoFocus>{days.map((d) => <option key={d.id} value={d.id}>{dayLabel(d.date)} · {dayTitle(d)}</option>)}</select></label>
    </Form>
  );
}

/** First and last date of the trip; days follow the dates (ED-14). Removing days asks first (ED-09). */
function DatesForm(p: Props) {
  const s = useSave(p);
  const r = tripRange(p.t);
  const { f, text } = useFields({ from: r?.from ?? "", to: r?.to ?? "" });
  const submit = async () => {
    const res = setTripDates(p.t, f);
    const gone = res.ok ? daysOutside(p.t, f.from, f.to) : [];
    if (gone.length && !(await ask(sv.confirmRemoveDays, { details: gone.map((d) => `${shortDate(d.date)} ${d.title}`) }))) return;
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
    const found = loc === (d?.location ?? "") ? undefined : loc ? await lookupPlace(loc) : null; // with the country (UP-24)
    const weather = found === undefined ? undefined : found?.weather ?? null, country = found === undefined ? undefined : found?.country ?? null;
    s.submit(saveDay(p.t, { ...f, weather, country }, p.id), p.id ? "edit day" : "add day");
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

const NEW_WISH = "__new"; // "Ny önskan" in the wish field (ED-29)

/** Vad, the time and the category tiles, the rest under "Fler detaljer" (ED-27); the time and the duration filled in (ED-28) and a new
 * wish made by default (ED-29), so that an activity is added on a phone with a few taps. */
function ActivityForm(p: Props & { dayId: string; id?: string }) {
  const s = useSave(p);
  const day = p.t.days.find((x) => x.id === p.dayId);
  const a = day?.activities.find((x) => x.id === p.id);
  const { f, text, check, set } = useFields({
    start: a ? a.start ?? "" : suggestStart(day?.activities ?? []), estimated: a?.estimated ?? false, text: a?.text ?? "", place: a?.placeIds[0] ?? "", placeName: "", address: "",
    category: a?.category ?? "", duration: String(a?.durationMin ?? ""), note: a?.note ?? "", dreamId: a?.dreamId ?? "",
    vehicle: a?.travel?.vehicle ?? "", travelMin: String(a?.travel?.durationMin ?? ""), // TR-20
  });
  const [hiddenFrom, setHiddenFrom] = useState<string[]>(a?.hiddenFrom ?? []); // AU-18
  const [ownDuration, setOwnDuration] = useState(!!a?.durationMin); // until the user sets one, the duration follows the category (ED-28)
  const [ownWish, setOwnWish] = useState(!!a); // until the user picks, a new activity proposes a new wish (ED-29)
  const wish = ownWish ? f.dreamId : wishByDefault(f.category, hiddenFrom, !!p.wishes) ? NEW_WISH : "";
  const pick = (c: string) => { set("category", c); if (!ownDuration) set("duration", String(defaultDuration(c) ?? "")); };
  const place = f.place === "__new" ? { kind: "new" as const, name: f.placeName, address: f.address }
    : f.place ? { kind: "existing" as const, id: f.place } : { kind: "none" as const };
  return (
    <Form title={p.id ? sv.editActivity : sv.newActivity} {...s} close={p.close}
      onSubmit={() => {
        const durationMin = a?.pinned ? undefined : Number(f.duration) || undefined; // ED-25: a pinned activity keeps its time
        const miss = f.text.trim() && !a?.pinned ? activityMissing({ start: f.start, durationMin, category: f.category }) : null; // ED-15; saveActivity reports a missing text
        s.submit(miss ? { ok: false, error: miss } : saveActivity(p.t, p.dayId, { start: f.start, estimated: f.estimated, text: f.text, place, category: f.category, durationMin, note: f.note,
          dreamId: wish === NEW_WISH ? "" : wish, newWish: wish === NEW_WISH, hiddenFrom: p.t.travelers.map((x) => x.id).filter((id) => hiddenFrom.includes(id)), travel: travelInput(f.vehicle, f.travelMin) }, p.id),
          p.id ? "edit activity" : "add activity");
      }}
      onRemove={p.id && !a?.pinned ? () => s.remove(removeActivity(p.t, p.dayId, p.id!), "remove activity") : undefined}>
      <label>{sv.what}<input {...text("text")} autoFocus={!a} /></label>
      {a?.pinned && <p className="ro note">{sv.pin.locked}</p> /* ED-25 */}
      <label>{sv.time}<input type="time" {...text("start")} disabled={a?.pinned} /></label>
      <fieldset className="tiles four"><legend>{sv.category}</legend>
        {ACTIVITY_CATEGORIES.map((c) => <label className="tile" key={c.name}>
          <input type="radio" name="acategory" value={c.name} checked={f.category === c.name} onChange={() => pick(c.name)} /><span aria-hidden="true"><CatIcon id={c.name} /></span><span>{c.name}</span>
        </label>)}
      </fieldset>
      <details className="more"><summary>{sv.moreDetails}</summary>
        {f.category !== TIME_POINT && <div className="two">{/* a Klockslag has no duration (ED-20) */}
          <label>{sv.duration}<select value={f.duration} onChange={(e) => { setOwnDuration(true); set("duration", e.target.value); }} disabled={a?.pinned}>
            <option value="">{sv.chooseDuration}</option>
            {[...new Set([...DURATIONS, ...(f.duration ? [Number(f.duration)] : [])])].sort((x, y) => x - y).map((m) => <option key={m} value={m}>{fmtDuration(m)}</option>)}
          </select></label>
          <label className="check"><input type="checkbox" {...check("estimated")} disabled={a?.pinned} />{sv.estimate}</label>
        </div>}
        <label>{sv.activityNote}<input {...text("note")} /></label>
        <label>{sv.minnas.dream}<select value={wish} onChange={(e) => { setOwnWish(true); set("dreamId", e.target.value); }}> {/* the wish it makes come true (MI-19, ED-29) */}
          {p.wishes && !a?.dreamId && <option value={NEW_WISH}>{sv.newWishOption}</option>}
          <option value="">{sv.minnas.noDream}</option>
          {p.t.dreams.filter((w) => !w.hidden).map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
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
        <div className="two">{/* the way here from the place before (TR-20) */}
          <label>{sv.travelHere}<select {...text("vehicle")}>
            <option value="">{sv.noTravel}</option>
            {(["walk", "transit", "car", "train", "ferry"] as const).map((v) => <option key={v} value={v}>{sv.travelVehicles[v]}</option>)}
          </select></label>
          {f.vehicle && <label>{sv.travelMin}<input inputMode="numeric" {...text("travelMin")} /></label>}
        </div>
        {p.t.travelers.some((x) => x.id !== p.self) && <fieldset className="hidefrom"> {/* no one hides an activity from themselves (AU-18) */}
          <legend>{svAdmin.hidden.pickLabel}</legend>
          <details className="multi"><summary>{pickedLabel(p.t, hiddenFrom)}</summary> {/* a dropdown with several choices (AU-25) */}
            <div className="menu">{p.t.travelers.filter((x) => x.id !== p.self).map((x) => <label className="check" key={x.id}><input type="checkbox" checked={hiddenFrom.includes(x.id)}
              onChange={(e) => setHiddenFrom((h) => (e.target.checked ? [...h, x.id] : h.filter((id) => id !== x.id)))} />{x.name}</label>)}</div>
          </details>
          <p className="ro note">{svAdmin.hidden.hint}</p>
        </fieldset>}
      </details>
    </Form>
  );
}

function BookingForm(p: Props & { id?: string; proposal?: MailProposal }) {
  const s = useSave(p);
  const b = p.t.bookings.find((x) => x.id === p.id), mail = p.proposal;
  // What was read from the mail or a pasted text, and the "Att boka" booking it fills in, "" for a new one (BK-17, BK-18, BK-22)
  const [read, setRead] = useState<{ r: BookingReading; files: TicketFile[] } | null>(() => (mail?.booking ? { r: mail.booking, files: mail.booking.files ?? [] } : null));
  const matches = !p.id && read ? toBookMatches(p.t, read.r) : [];
  const [target, setTarget] = useState(() => matches[0]?.id ?? "");
  const fillIn = (base: BookingInput, r: BookingReading, files: TicketFile[], into: string): BookingInput => {
    const to = p.t.bookings.find((x) => x.id === into);
    const g = to ? matchedForm(p.t, to, r, files) : { ...readingToForm(base, r), files: [...(base.files ?? []), ...files] };
    return g.kind === "ticket" && !g.activityId ? { ...g, activityId: ticketActivityFor(p.t, g.name, g.from, g.start) ?? "" } : g; // BK-23
  };
  const [f, setF] = useState<BookingInput>(() => (read ? fillIn(bookingForm(p.t, b), read.r, read.files, target) : bookingForm(p.t, b)));
  const retarget = (into: string) => { setTarget(into); if (read) setF(fillIn(bookingForm(p.t), read.r, read.files, into)); };
  const text = (k: keyof BookingInput) => ({ value: (f[k] as string | undefined) ?? "", onChange: (e: Change) => setF((o) => ({ ...o, [k]: e.target.value })) });
  const [paste, setPaste] = useState<string | null>(null), [filled, setFilled] = useState(""); // BK-18
  const fill = () => {
    const r = readBooking({ text: paste ?? "" }, p.t.days.map((d) => d.date));
    setFilled(Object.keys(r).length ? sv.mail.filled : sv.mail.nothing);
    if (!Object.keys(r).length) return;
    const into = p.id ? "" : toBookMatches(p.t, r)[0]?.id ?? "";
    setRead({ r, files: [] }); setTarget(into); setF((o) => fillIn(o, r, [], into)); setPaste(null);
  };
  const [aiNote, setAiNote] = useState<{ text: string; ai?: boolean } | null>(null); // AI-60
  const readAi = async () => {
    if (!mail || !read) return;
    setAiNote({ text: sv.aiRead.mailBusy });
    const r = await api.mailRead(p.t.id, mail.id);
    if (!r.ok) { setAiNote({ text: aiErrorText(r) }); return; }
    const { ai, ...reading } = r.reading;
    if (!ai.length) { setAiNote({ text: sv.aiRead.mailNothing }); return; }
    setRead({ r: reading, files: read.files });
    setF((o) => fillIn({ ...o, files: (o.files ?? []).filter((x) => !read.files.some((y) => y.id === x.id)) }, reading, read.files, target));
    setAiNote({ text: sv.aiRead.mailDone(ai.map((k) => sv.aiRead.fields[k] ?? k).join(", ")), ai: true });
  };
  const [uploading, setUploading] = useState(false), pick = useRef<HTMLInputElement>(null);
  const addFiles = async (list: FileList | null) => { // BK-09
    setUploading(true);
    for (const file of Array.from(list ?? [])) {
      const c = checkPick(file);
      if (c === "type" || c === "tooBig") { s.setErr(c === "type" ? sv.tickets.badType : sv.tickets.tooBig); continue; }
      const blob = c === "scale" ? await import("./ticketFiles.ts").then((m) => m.scaleImage(file)) : file;
      if (!blob) { s.setErr(sv.tickets.badImage); continue; }
      const name = c === "scale" ? file.name.replace(/\.[^.]*$/, "") + ".jpg" : file.name;
      try {
        const up = await api.uploadFile(p.t.id, blob, name);
        setF((o) => ({ ...o, files: [...(o.files ?? []), up] }));
      } catch { s.setErr(sv.tickets.failed); }
    }
    setUploading(false);
    if (pick.current) pick.current.value = "";
  };
  const kinds: NonNullable<BookingInput["kind"]>[] = ["stay", "ticket", "other", ...(b?.kind === "transport" ? ["transport" as const] : [])];
  const acts = ticketActivities(p.t, f.from);
  const submit = () => {
    const r = saveBooking(p.t, f, p.id ?? (target || undefined)); // BK-22: a chosen "Att boka" booking is updated
    if (mail && p.approveMail) s.submit(r, "", (ops) => p.approveMail!(mail.id, ops)); // BK-17: saving approves the mail
    else s.submit(r, p.id || target ? "edit booking" : "add booking");
  };
  const remove = mail && p.rejectMail ? async () => { if (await ask(sv.mail.confirmReject)) p.rejectMail!(mail.id).then(p.close); }
    : p.id ? () => s.remove(removeBooking(p.t, p.id!), "remove booking") : undefined;
  return (
    <Form title={mail ? sv.mail.review : p.id ? sv.editBooking : sv.newBooking} {...s} close={p.close} onSubmit={submit} onRemove={remove}>
      {mail && <p className="ro note mailfrom"><span className="ico"><Icon name="mail" /></span>{sv.mail.from(mail.source?.subject || sv.mail.noSubject, mail.source?.from ?? "")}<br />{sv.mail.checkFilled}
        {p.aiRead && <IconButton icon="sparkle" look="bare" tip="left" label={sv.aiRead.mail} onClick={readAi} /> /* AI-60 */}
        {p.mailToWish && <IconButton icon="refresh" look="bare" tip="left" label={sv.mail.toWish} onClick={async () => { if (await ask(sv.mail.confirmToWish, { ok: sv.mail.toWish })) p.mailToWish!(mail.id).then(p.close); }} /> /* BK-29 */}</p>}
      {aiNote && <p className="ro note" role="status">{aiNote.ai && <AiMark />}{aiNote.text}</p>}
      {matches.length > 0 && <label>{sv.mail.target}<select value={target} onChange={(e) => retarget(e.target.value)}>
        <option value="">{sv.mail.newBooking}</option>
        {matches.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>{target && <small className="ro">{sv.mail.targetHint}</small>}</label>}
      <div className="lblrow">
        <label htmlFor="bname">{sv.name}</label>
        <IconButton icon="paste" look="bare" tip="left" label={sv.mail.paste} pressed={paste !== null} onClick={() => { setPaste((x) => (x === null ? "" : null)); setFilled(""); }} />
      </div>
      {paste !== null && <div className="pastebox">
        <label>{sv.mail.pasteLabel}<textarea rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} autoFocus /></label>
        <button type="button" className="btn ghost" onClick={fill} disabled={!paste.trim()}>{sv.mail.read}</button>
      </div>}
      {filled && <p className="ro note" role="status">{filled}</p>}
      <input id="bname" {...text("name")} autoFocus={paste === null} />
      <label>{sv.bookingKinds.label}<select {...text("kind")}>{kinds.map((k) => <option key={k} value={k}>{sv.bookingKinds[k]}</option>)}</select></label>
      <div className="two">
        <label>{sv.firstDate}<input type="date" {...text("from")} /></label>
        <label>{sv.lastDate}<input type="date" {...text("to")} /></label>
      </div>
      {f.kind === "stay" && <div className="two">
        <label>{sv.bookingKinds.checkIn}<input type="time" {...text("checkIn")} /></label>
        <label>{sv.bookingKinds.checkOut}<input type="time" {...text("checkOut")} /></label>
      </div>}
      {f.kind === "ticket" && <div className="two">
        <label>{sv.bookingKinds.start}<input type="time" {...text("start")} /></label>
        <label>{sv.bookingKinds.activity}<select {...text("activityId")}>
          <option value="">{sv.bookingKinds.noActivity}</option>
          {acts.map((a) => <option key={a.id} value={a.id}>{a.text || sv.hiddenActivity}</option>)}
        </select></label>
      </div>}
      <label>{sv.status}<select {...text("status")}>
        {(Object.keys(sv.statuses) as (keyof typeof sv.statuses)[]).map((k) => <option key={k} value={k}>{sv.statuses[k]}</option>)}
      </select></label>
      <label>{sv.reference}<input {...text("reference")} /></label>
      <div className="two">
        <label>{sv.mail.price}<input inputMode="decimal" {...text("price")} /></label>
        <label>{sv.currency}<select {...text("currency")}>{[...new Set([...sv.currencies, f.currency ?? p.t.currency])].map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <p className="ro note">{sv.mail.priceHint}</p>
      <label>{sv.placeLabel}<PlaceSelect t={p.t} bind={text("placeId")} /></label>
      <label>{sv.description}<textarea {...text("note")} /></label>
      <fieldset className="files"><legend>{sv.tickets.title}</legend>
        {(f.files ?? []).map((x) => (
          <div className="row mid" key={x.id}>
            <span><Icon name={x.type === "application/pdf" ? "file" : "ticket"} /> {x.name} <small className="ro">{Math.max(1, Math.round(x.size / 1024))} kB</small></span>
            <IconButton icon="trash" look="bare" tip="left" label={sv.tickets.remove(x.name)}
              onClick={async () => { if (await ask(sv.tickets.confirmRemove)) setF((o) => ({ ...o, files: (o.files ?? []).filter((y) => y.id !== x.id) })); }} />
          </div>
        ))}
        <input ref={pick} type="file" hidden multiple accept="application/pdf,image/*" onChange={(e) => addFiles(e.target.files)} />
        <div className="add">{uploading ? <span className="ro">{sv.tickets.uploading}</span>
          : <IconButton icon="attach" label={sv.tickets.add} tip="right" onClick={() => pick.current?.click()} />}</div>
      </fieldset>
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
    case "budgetMax": return <BudgetMaxForm {...p} />;
    case "day": return <DayForm {...p} id={dlg.id} />;
    case "activity": return <ActivityForm {...p} dayId={dlg.dayId} id={dlg.id} />;
    case "booking": return <BookingForm {...p} id={dlg.id} proposal={dlg.proposal} />;
    case "budget": return <BudgetForm {...p} id={dlg.id} />;
    case "task": return <TaskForm {...p} id={dlg.id} />;
    case "placeEdit": return <PlaceForm {...p} id={dlg.id} />;
    case "info": return <InfoForm {...p} id={dlg.id} />;
    case "album": return <AlbumForm {...p} />;
    case "memory": return <MemoryForm {...p} dreamId={dlg.dreamId} by={dlg.by} />;
    case "split": return <SplitForm {...p} id={dlg.id} />;
    case "relink": return <RelinkForm {...p} id={dlg.id} />;
    case "planWish": return <PlanWishForm {...p} id={dlg.id} />;
    default: return null;
  }
}
