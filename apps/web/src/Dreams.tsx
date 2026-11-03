// The dream board on Önska (DB-01..DB-04), loaded on demand so the main page stays small (PF-01).
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Trip } from "@trip/schema";
import { categoryIcon } from "./categories.ts";
import { sv } from "./sv.ts";
import { AiMark, Icon, IconButton, PlannedMark } from "./Icons.tsx";
import { CatIcon, ICONS } from "./CatIcon.tsx";
import { WISH_BG } from "./palette.ts";
import { AiKeep, HiddenText, SuggestionActions, TextEye, type Run, type TripViewProps } from "./TripView.tsx";
import type { WishSuggestion } from "./aiWishes.ts";
import { dayLabel, memoriesLine } from "./format.ts";
import { api } from "./api.ts";
import { MailInButton } from "./MailIn.tsx";
import { cardImage, creditMark, plannedWishes, wishDetail } from "./wishes.ts";

const pictures = new Map<string, Promise<string>>(); // object URLs of wish images, fetched once per page (DB-09)
/** A wish's copied image, fetched with the link's credentials; `fallback` while it loads or when it cannot be shown (DB-28). */
export function WishPicture({ tripId, file, whole = false, fallback }: { tripId: string; file: string; whole?: boolean; fallback?: ReactNode }) {
  const [src, setSrc] = useState<string>(), [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    if (!pictures.has(file)) pictures.set(file, api.file(tripId, file).then((b) => URL.createObjectURL(b)));
    pictures.get(file)!.then((u) => live && setSrc(u), () => { pictures.delete(file); if (live) setFailed(true); });
    return () => { live = false; };
  }, [tripId, file]);
  // a Commons image whole, not cropped (DB-09)
  return src && !failed ? <img className={`wishpic${whole ? " whole" : ""}`} src={src} alt="" onError={() => setFailed(true)} /> : fallback ?? null;
}

/** A wish's card, the same in Önska and in Minnas (DB-01, DB-02, MI-16); without `vote` the heart is read-only, and Minnas shows none.
 * Pressing the image area opens Om önskan, where a Commons image is credited (DB-09, DB-15). */
/** `planned`: the wish is in the plan, marked in a corner of the image area (DB-19); Minnas leaves it out. */
export function DreamCard({ t, d, i, vote, votes = true, open, planned, children }: { t: Trip; d: Trip["dreams"][number]; i: number; vote?: () => void; votes?: boolean; open?: () => void; planned?: boolean; children?: ReactNode }) {
  const pic = cardImage(d); // DB-09: the image in place of the icon
  const icon = <CatIcon id={categoryIcon(d.category) ?? d.icon} big />;
  const area = <>{pic ? <WishPicture tripId={t.id} file={pic.file} whole={pic.whole} fallback={icon} /> : icon}
    {creditMark(d) && <span className="picinfo" aria-hidden="true">i</span> /* DB-09: the credit is under Om önskan */}
    {planned && <PlannedMark />}</>;
  const bg = { background: ICONS[d.category] ? `color-mix(in srgb, ${ICONS[d.category].color} 22%, var(--card))` : WISH_BG[i % 3] };
  return (
    <article className="card dream">
      {open && !d.hidden ? <button type="button" className="img open" style={bg} aria-label={planned ? `${sv.wish.more(d.title)}, ${sv.wish.planned}` : sv.wish.more(d.title)} title={creditMark(d) ? sv.wish.credited : undefined} onClick={open}>{area}</button>
        : <div className="img" style={bg}>{area}</div>}
      {votes && <button className="heart" onClick={vote} aria-label={sv.vote} disabled={!vote}><Icon name="heart" />{d.votes}</button>}
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
    {(() => { const line = memoriesLine([...new Set(list.flatMap((x) => x.memories ?? []))]); return line && <p className="ro note"><AiMark />{line}</p>; })() /* AI-91 */}
    <div className="dreams">{list.map((s, i) => { const day = t.days.find((d) => d.id === s.day); return (
      <DreamCard key={s.id} t={t} d={s.wish} i={i} votes={false}>
        <div className="sugmeta">{day && <small className="ro">{sv.aiRun.onDay(dayLabel(day.date))}</small>}
          {s.wish.url && <small><a className="place" href={s.wish.url} target="_blank" rel="noopener noreferrer">{sv.aiRun.checkSource}</a></small>}</div>
        <SuggestionActions id={s.id} text={s.wish.title} review={review} />
      </DreamCard>); })}</div>
  </section>;
}

export default function Dreams({ t, write, vote, addDream, editImage, open, suggestions = [], review, run }: { t: Trip; write: boolean; vote: (i: number) => void; addDream: () => void; editImage: (id: string) => void; open: (id: string) => void;
  suggestions?: WishSuggestion[]; review?: TripViewProps["review"]; run: Run }) {
  const planned = plannedWishes(t); // DB-19
  return <>
    <div className="dreambar"><MailInButton t={t} may /></div>{/* BK-27; the server answers only those who may have the address */}
    {review && <Suggested t={t} list={suggestions} review={review} />}
    <div className="dreams">{t.dreams.map((d, i) => <DreamCard key={d.id} t={t} d={d} i={i} planned={!d.hidden && planned.has(d.id)} vote={write ? () => vote(i) : undefined} open={() => open(d.id)}>
      {write && !d.hidden && <div className="wishtools"><IconButton icon="image" look="bare" tip="right" label={sv.wish.image(d.title)} onClick={() => editImage(d.id)} />
        {d.ai && <AiKeep item={{ kind: "wish", id: d.id }} text={d.title} run={run} /> /* AI-83 */}</div> /* DB-10 */}
    </DreamCard>)}</div>
    {write && <IconButton icon="plus" look="fab" tip="up" label={sv.addDream} onClick={addDream} />}
  </>;
}
