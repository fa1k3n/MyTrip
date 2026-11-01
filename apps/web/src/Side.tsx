// Nåla's side column, with no locks (ED-21): wishes to plan, bookings, budget, tasks, practical information and packing lists.
// Loaded on demand with the Nåla tab to keep the page under 200 KB (PF-01).
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Trip } from "@trip/schema";
import { bookingDates, bookingTimes, kr, shortDate, statusBadge } from "./format.ts";
import { api, type MailProposal } from "./api.ts";
import { BudgetPlanView, LimitIcon, limitClass } from "./Donut.tsx";
import { amountText } from "./budget.ts";
import { addPacking, isPacked, packedCount, removePacking, togglePacked, toggleTask } from "./edit.ts";
import { isOverdue } from "./today.ts";
import { sv } from "./sv.ts";
import { Icon, IconButton, PlannedMark } from "./Icons.tsx";
import { HiddenText, InfoText, KindIcon, PlaceLink, TextEye, TicketButton, type Run } from "./TripView.tsx";
import type { EditDlg } from "./editKinds.ts";
import { atLeast, type Level } from "@trip/schema/src/rules.ts";
import { categoryIcon } from "./categories.ts";
import { CatIcon } from "./CatIcon.tsx";
import { byVotes, plannedWishes } from "./wishes.ts";
import { WISH_DRAG } from "./schedule.ts";

type MayOf = (id: string) => boolean; // whether the role may change that section (AU-21)

/** A collapsible section of the side column, closed by default (BG-01, PK-02). It has no lock: its editing controls show
 * when the role may change it, and a section it may only read shows none (ED-21, AU-21). */
const Section = ({ title, may, flag, tint = "", children }: { title: string; may: boolean; flag?: ReactNode; tint?: string; children: ReactNode }) => (
  <details className={`card sec ${may ? "" : "lock"} ${tint}`}>
    <summary><h3>{title}</h3>{flag}</summary>
    {children}
  </details>
);

/** Nåla's budget: the shared card, then the budget items in the category order, each with its edit button (BG-17, BG-20). */
function Budget({ t, edit, part }: { part: MayOf; t: Trip; edit: (d: EditDlg) => void }) {
  const label = (i: Trip["budget"][number]) => i.note ?? i.category;
  const rank = (c: string) => { const i = sv.budgetCategories.indexOf(c); return i < 0 ? sv.budgetCategories.length : i; };
  const items = [...t.budget].sort((a, b) => rank(a.category) - rank(b.category));
  return (
    <Section title={sv.budget} may={part("budget")} flag={<LimitIcon t={t} />} tint={limitClass(t)}>
      <BudgetPlanView t={t}>
        {items.length > 0 && <div className="bitems"><h4>{sv.plan.items}</h4>{items.map((i) => (
          <div className="row mid" key={i.id}>
            <span>{i.hidden ? <HiddenText /> : <>{label(i)}<TextEye t={t} texts={[i.category, i.note]} /><br /><small className="ro">{[i.note && i.category, i.owner].filter(Boolean).join(" · ")}</small></>}</span>
            <span className="end">{i.paid && !i.estimate && i.amount !== undefined && <span className="badge">{sv.badge.paid}</span>}{amountText(i, t.currency)}
              {!i.hidden && <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${label(i)}`} onClick={() => edit({ kind: "budget", id: i.id })} mut />}</span>
          </div>
        ))}</div>}
      </BudgetPlanView>
      <div className="add"><IconButton icon="plus" label={sv.addCost} onClick={() => edit({ kind: "budget" })} mut tip="right" /></div>
    </Section>
  );
}

/** A wish's hearts, read only: votes are given in Önska (DB-02, DB-16). */
const Votes = ({ n }: { n: number }) => <span className="votes" role="img" aria-label={sv.wish.votes(n)} title={sv.wish.votes(n)}>♥ {n}</span>;

/** The wishes to plan, the most voted first: each is dragged onto a day or put on one with its button (DB-16..DB-18).
 * Shown only to a role that may change the plan, so every wish can be planned. */
function Wishes({ t, edit }: { t: Trip; edit: (d: EditDlg) => void }) {
  const planned = plannedWishes(t);
  return (
    <Section title={sv.wish.wishes} may>
      {!t.dreams.length && <p className="ro">{sv.wish.noWishes}</p>}
      {byVotes(t.dreams).map((d) => d.hidden ? <div className="row mid wishrow" key={d.id}><span className="wishname"><HiddenText /></span><Votes n={d.votes} /></div> : (
        <div className="row mid wishrow drag" key={d.id} draggable title={sv.wish.dragHint}
          onDragStart={(e) => { e.dataTransfer.setData(WISH_DRAG, d.id); e.dataTransfer.effectAllowed = "copy"; }}>
          <span className="wishname"><span className="grip" aria-hidden="true"><Icon name="grip" /></span><CatIcon id={categoryIcon(d.category) ?? d.icon} /><span>{d.title}</span>{planned.has(d.id) && <PlannedMark />}</span>
          <Votes n={d.votes} />
          <IconButton icon="calplus" look="bare" tip="left" label={sv.wish.toDayOf(d.title)} onClick={() => edit({ kind: "planWish", id: d.id })} mut />
        </div>
      ))}
    </Section>
  );
}

/** Mail to the trip's inbox waiting for review, for those who may change bookings (BK-17); others get none. */
function useMailProposals(t: Trip, may: boolean) {
  const [list, setList] = useState<MailProposal[]>([]);
  useEffect(() => {
    if (!may) { setList([]); return; }
    let live = true;
    api.proposals(t.id).then((ps) => { if (live) setList(ps.filter((p) => p.status === "pending" && p.source?.kind === "mail")); }, () => {});
    return () => { live = false; };
  }, [t, may]);
  return list;
}

function Bookings({ t, edit, onPlace, part }: { part: MayOf; t: Trip; edit: (d: EditDlg) => void; onPlace: (id: string) => void }) {
  const mails = useMailProposals(t, part("bookings"));
  const flag = mails.length > 0 && <span className="mailflag" role="img" aria-label={sv.mail.waiting(mails.length)} title={sv.mail.waiting(mails.length)}><Icon name="mail" />{mails.length}</span>;
  return (
    <Section title={sv.bookings} may={part("bookings")} flag={flag}>
      {mails.length > 0 && <div className="mails">{/* not an editing control: reviewing is the point (BK-17) */}
        <p className="ro note">{sv.mail.waiting(mails.length)}</p>
        {mails.map((m) => (
          <button type="button" className="row mid mail" key={m.id} onClick={() => edit({ kind: "booking", proposal: m })} aria-label={sv.mail.open(m.source?.subject || sv.mail.noSubject)}>
            <span><Icon name="mail" /> {m.booking?.name ?? (m.source?.subject || sv.mail.noSubject)}<br />
              <small className="ro">{m.source?.from}{m.source?.at ? ` · ${shortDate(m.source.at.slice(0, 10))}` : ""}</small></span>
          </button>
        ))}
      </div>}
      {t.bookings.map((b) => (
        <div className={`row mid ${b.status === "cancelled" ? "off" : ""}`} key={b.id}>
          <span><KindIcon kind={b.kind} />{b.hidden ? <HiddenText /> : <><PlaceLink t={t} id={b.placeId} text={b.name} onPlace={onPlace} /><TextEye t={t} texts={[b.name, b.note]} placeId={b.placeId} /></>}<br />
            <small className="ro">{bookingDates(b)}{bookingTimes(b) ? ` · ${bookingTimes(b)}` : ""}{b.reference ? ` · ${b.reference}` : ""}</small>
            {b.note && <><br /><small className="ro">{b.note}</small></>}</span>
          <span className="end"><span className={statusBadge(b.status)}>{sv.badge[b.status]}</span>
            <TicketButton b={b} edit={edit} />
            {!b.hidden && <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${b.name}`} onClick={() => edit({ kind: "booking", id: b.id })} mut />}</span>
        </div>
      ))}
      <div className="add"><IconButton icon="plus" label={sv.addBooking} onClick={() => edit({ kind: "booking" })} mut tip="right" /></div>
    </Section>
  );
}

function Tasks({ t, today, edit, run, onPlace, part, tick }: { part: MayOf; t: Trip; today: string; edit: (d: EditDlg) => void; run: Run; onPlace: (id: string) => void; tick: boolean }) {
  return (
    <Section title={sv.todo} may={part("tasks")}>
      {!t.tasks.length && <p className="ro">{sv.noTasks}</p>}
      {t.tasks.map((k) => (
        <div className="row mid todo" key={k.id}>
          <label className="check">
            <input type="checkbox" checked={k.done} disabled={!tick} onChange={() => run((x) => toggleTask(x, k.id), k.done ? "task undone" : "task done")} />
            <span className={k.done ? "done" : ""}>{k.hidden ? <HiddenText /> : <>{k.text}<TextEye t={t} texts={[k.text]} placeId={k.placeId} /></>}
              {k.placeId && <> · <PlaceLink t={t} id={k.placeId} onPlace={onPlace} /></>}
              {k.due && <small className="ro"> · {shortDate(k.due)}</small>}
              {isOverdue(k, today) && <> <span className="badge late">{sv.overdue}</span></>}</span>
          </label>
          {!k.hidden && <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${k.text}`} onClick={() => edit({ kind: "task", id: k.id })} mut />}
        </div>
      ))}
      <p className="ro note">{sv.tasksShared}</p>
      <div className="add"><IconButton icon="plus" label={sv.addTask} onClick={() => edit({ kind: "task" })} mut tip="right" /></div>
    </Section>
  );
}

function Info({ t, edit, onPlace, part }: { part: MayOf; t: Trip; edit: (d: EditDlg) => void; onPlace: (id: string) => void }) {
  return (
    <Section title={sv.info} may={part("info")}>
      {!t.info.length && <p className="ro">{sv.noInfo}</p>}
      {t.info.map((x) => (
        <div className="row mid" key={x.id}>
          <InfoText t={t} x={x} onPlace={onPlace} />
          {!x.hidden && <IconButton icon="edit" look="bare" tip="left" label={`${sv.edit} ${x.title}`} onClick={() => edit({ kind: "info", id: x.id })} mut />}
        </div>
      ))}
      <div className="add"><IconButton icon="plus" label={sv.addInfo} onClick={() => edit({ kind: "info" })} mut tip="right" /></div>
    </Section>
  );
}

function PackingList({ name, items, packed, count, onAdd, onRemove, onCheck, tick }: {
  name: string; items: string[]; packed: (item: string) => boolean; count: { packed: number; total: number }; tick: boolean;
  onAdd: (text: string) => void; onRemove: (i: number) => void; onCheck: (item: string) => void;
}) {
  const [v, setV] = useState("");
  const submit = (e: FormEvent) => { e.preventDefault(); if (v.trim()) { onAdd(v); setV(""); } };
  return (
    <details className="box">
      <summary><span>{name} <small className="ro">({count.packed}/{count.total})</small></span></summary>
      <ul>{items.map((it, i) => (
        <li key={`${i}-${it}`}>
          <label className="check"><input type="checkbox" checked={packed(it)} disabled={!tick} onChange={() => onCheck(it)} /><span className={packed(it) ? "done" : ""}>{it}</span></label>
          <IconButton icon="trash" look="bare" tip="left" label={`${sv.removeItem} ${it}`} onClick={() => onRemove(i)} mut /></li>
      ))}</ul>
      <form className="addrow" data-mut="" onSubmit={submit}>
        <input value={v} onChange={(e) => setV(e.target.value)} aria-label={`${sv.itemLabel}, ${name}`} placeholder={sv.itemLabel} />
        <button type="submit" className="btn ghost icon tip-left" aria-label={`${sv.addItem}: ${name}`} data-tip={sv.addItem}><Icon name="plus" /></button>
      </form>
    </details>
  );
}

function Packing({ t, run, part, tick }: { part: MayOf; t: Trip; run: Run; tick: boolean }) {
  const lists = [{ id: "shared", name: sv.sharedList, items: t.packing },
    ...t.travelers.map((x) => ({ id: x.id, name: x.age ? `${x.name}, ${x.age} ${sv.years}` : x.name, items: x.packing }))]; // PK-03
  return (
    <Section title={sv.packing} may={part("packing")}>
      {lists.map((l) => (
        <PackingList key={l.id} tick={tick} name={l.name} items={l.items} packed={(it) => isPacked(t, l.id, it)} count={packedCount(t, l.id)}
          onCheck={(it) => run((x) => togglePacked(x, l.id, it), isPacked(t, l.id, it) ? "unpacked" : "packed")}
          onAdd={(text) => run((x) => addPacking(x, l.id, text), "add packing")}
          onRemove={(i) => run((x) => removePacking(x, l.id, i), "remove packing")} />
      ))}
    </Section>
  );
}

/** Each section follows the role's level: hidden, read, check or change (AU-20, AU-21). */
export default function Side({ t, today, edit, run, onPlace, parts, wishes }: {
  parts: Record<string, Level>; // the role's levels on Nåla's components (AU-20)
  wishes: boolean; // the role sees the wishes (DB-16)
  t: Trip; today: string; edit: (d: EditDlg) => void; run: Run; onPlace: (id: string) => void;
}) {
  const part = (id: string) => parts[id] === "write";
  return <>
    {wishes && parts.plan === "write" && <Wishes t={t} edit={edit} />}
    {parts.bookings !== "hidden" && <Bookings part={part} t={t} edit={edit} onPlace={onPlace} />}
    {parts.budget !== "hidden" && <Budget part={part} t={t} edit={edit} />}
    {parts.tasks !== "hidden" && <Tasks part={part} t={t} today={today} edit={edit} run={run} onPlace={onPlace} tick={atLeast(parts.tasks, "check")} />}
    {parts.info !== "hidden" && <Info part={part} t={t} edit={edit} onPlace={onPlace} />}
    {parts.packing !== "hidden" && <Packing part={part} t={t} run={run} tick={atLeast(parts.packing, "check")} />}
  </>;
}
