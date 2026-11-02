// The dream board on Önska (DB-01..DB-04), loaded on demand so the main page stays small (PF-01).
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Trip } from "@trip/schema";
import { categoryIcon } from "./categories.ts";
import { sv } from "./sv.ts";
import { AiMark, IconButton, PlannedMark } from "./Icons.tsx";
import { CatIcon, ICONS } from "./CatIcon.tsx";
import { HiddenText, SuggestionActions, TextEye, type TripViewProps } from "./TripView.tsx";
import type { WishSuggestion } from "./aiWishes.ts";
import { dayLabel } from "./format.ts";
import { api } from "./api.ts";
import { cardImage, creditMark, plannedWishes, wishDetail } from "./wishes.ts";

const pictures = new Map<string, Promise<string>>(); // object URLs of wish images, fetched once per page (DB-09)
/** A wish's copied image, fetched with the link's credentials. */
export function WishPicture({ tripId, file, whole = false }: { tripId: string; file: string; whole?: boolean }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    if (!pictures.has(file)) pictures.set(file, api.file(tripId, file).then((b) => URL.createObjectURL(b)));
    pictures.get(file)!.then((u) => live && setSrc(u), () => pictures.delete(file));
    return () => { live = false; };
  }, [tripId, file]);
  return src ? <img className={`wishpic${whole ? " whole" : ""}`} src={src} alt="" /> : null; // a Commons image whole, not cropped (DB-09)
}

const DREAM_BG = ["#E8D5C4", "#D5E0D8", "#EFE2BF"];

/** A wish's card, the same in Önska and in Minnas (DB-01, DB-02, MI-16); without `vote` the heart is read-only, and Minnas shows none.
 * Pressing the image area opens Om önskan, where a Commons image is credited (DB-09, DB-15). */
/** `planned`: the wish is in the plan, marked in a corner of the image area (DB-19); Minnas leaves it out. */
export function DreamCard({ t, d, i, vote, votes = true, open, planned, children }: { t: Trip; d: Trip["dreams"][number]; i: number; vote?: () => void; votes?: boolean; open?: () => void; planned?: boolean; children?: ReactNode }) {
  const pic = cardImage(d); // DB-09: the image in place of the icon
  const area = <>{pic ? <WishPicture tripId={t.id} file={pic.file} whole={pic.whole} /> : <CatIcon id={categoryIcon(d.category) ?? d.icon} big />}
    {creditMark(d) && <span className="picinfo" aria-hidden="true">i</span> /* DB-09: the credit is under Om önskan */}
    {planned && <PlannedMark />}</>;
  const bg = { background: ICONS[d.category] ? `color-mix(in srgb, ${ICONS[d.category].color} 22%, var(--card))` : DREAM_BG[i % 3] };
  return (
    <article className="card dream">
      {open && !d.hidden ? <button type="button" className="img open" style={bg} aria-label={planned ? `${sv.wish.more(d.title)}, ${sv.wish.planned}` : sv.wish.more(d.title)} title={creditMark(d) ? sv.wish.credited : undefined} onClick={open}>{area}</button>
        : <div className="img" style={bg}>{area}</div>}
      {votes && <button className="heart" onClick={vote} aria-label={sv.vote} disabled={!vote}>♥ {d.votes}</button>}
      <div className="in"><h3>{d.hidden ? <HiddenText /> : <><TextEye t={t} texts={[d.title, d.source]} />{d.title}</>}</h3><span className="badge">{d.category}</span><div className="src">{d.source}</div>
        {children}</div>
    </article>
  );
}

/** Om önskan: the image larger and whole, the wish's page and, for a Commons image, its credit (DB-15). */
export function WishView({ t, id }: { t: Trip; id: string }) {
  const w = t.dreams.find((x) => x.id === id), v = w && wishDetail(w);
  if (!v) return null;
  const c = v.image?.credit;
  return <>
    <h3>{v.title}</h3>
    {v.image && <figure className="wishbig"><WishPicture tripId={t.id} file={v.image.file} whole /></figure>}
    <p><span className="badge">{v.category}</span> <span className="src">{v.source}</span></p>
    {c && <p className="credit-s">{sv.wish.photoBy} {c.author && <>{c.author} · </>}
      {c.licenceUrl ? <a href={c.licenceUrl} target="_blank" rel="noopener noreferrer">{c.licence}</a> : c.licence} · <a href={c.page} target="_blank" rel="noopener noreferrer">{sv.wish.commons}</a></p>}
    {v.url && <p><a className="btn" href={v.url} target="_blank" rel="noopener noreferrer">{sv.wish.openPage}</a></p>}
  </>;
}

/** AI-71: the wish helper's suggestions in their own row, apart from the travelers' wishes: each with the day of its activity (AI-77),
 * its source and buttons to take or reject it. */
function Suggested({ t, list, review }: { t: Trip; list: WishSuggestion[]; review: NonNullable<TripViewProps["review"]> }) {
  if (!list.length) return null;
  return <section className="sugrow" aria-labelledby="sugrow-h">
    <h2 id="sugrow-h"><AiMark />{sv.aiRun.wishRow}</h2>
    <p className="ro note">{sv.aiRun.wishRowHint}</p>
    <div className="dreams">{list.map((s, i) => { const day = t.days.find((d) => d.id === s.day); return (
      <DreamCard key={s.id} t={t} d={s.wish} i={i} votes={false}>
        <div className="sugmeta">{day && <small className="ro">{sv.aiRun.onDay(dayLabel(day.date))}</small>}
          {s.wish.url && <small><a className="place" href={s.wish.url} target="_blank" rel="noopener noreferrer">{sv.aiRun.checkSource}</a></small>}</div>
        <SuggestionActions id={s.id} text={s.wish.title} review={review} />
      </DreamCard>); })}</div>
  </section>;
}

export default function Dreams({ t, write, vote, addDream, editImage, open, suggestions = [], review }: { t: Trip; write: boolean; vote: (i: number) => void; addDream: () => void; editImage: (id: string) => void; open: (id: string) => void;
  suggestions?: WishSuggestion[]; review?: TripViewProps["review"] }) {
  const planned = plannedWishes(t); // DB-19
  const [mail, setMail] = useState(false);
  return <>
    {t.wishInbox && <div className="dreambar"><IconButton icon="mail" look="bare" tip="left" label={sv.wish.mail.open} onClick={() => setMail(true)} /></div> /* DB-22 */}
    {mail && t.wishInbox && <WishMail address={t.wishInbox} close={() => setMail(false)} />}
    {review && <Suggested t={t} list={suggestions} review={review} />}
    <div className="dreams">{t.dreams.map((d, i) => <DreamCard key={d.id} t={t} d={d} i={i} planned={!d.hidden && planned.has(d.id)} vote={write ? () => vote(i) : undefined} open={() => open(d.id)}>
      {write && !d.hidden && <div className="wishtools"><IconButton icon="image" look="bare" tip="right" label={sv.wish.image(d.title)} onClick={() => editImage(d.id)} /></div> /* DB-10 */}
    </DreamCard>)}</div>
    {write && <IconButton icon="plus" look="fab" tip="up" label={sv.addDream} onClick={addDream} />}
  </>;
}

/** DB-22: the trip's wish address, to copy, with what a mail to it becomes. */
function WishMail({ address, close }: { address: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    document.body.style.overflow = "hidden"; // PL-14
    return () => { document.body.style.overflow = ""; opener?.focus(); };
  }, []);
  const copy = async () => { try { await navigator.clipboard.writeText(address); setCopied(true); } catch { /* the field can still be copied by hand */ } };
  return (
    <dialog ref={ref} aria-label={sv.wish.mail.open} onClose={close}
      onClick={(e) => { // backdrop clicks land on the dialog itself, outside its box (PL-12)
        const r = e.currentTarget.getBoundingClientRect();
        if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) close();
      }}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} /></span>
      <h3>{sv.wish.mail.open}</h3>
      <p className="ro note">{sv.wish.mail.hint}</p>
      <div className="row mid">
        <input className="linkfield" readOnly value={address} aria-label={sv.wish.mail.open} onFocus={(e) => e.currentTarget.select()} />
        <span className="end"><IconButton icon="copy" look="bare" tip="left" label={sv.wish.mail.copy} onClick={copy} /></span>
      </div>
      {copied && <p className="ro" role="status">{sv.wish.mail.copied}</p>}
    </dialog>
  );
}
