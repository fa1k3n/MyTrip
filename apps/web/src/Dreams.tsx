// The dream board on Önska (DB-01..DB-04), loaded on demand so the main page stays small (PF-01).
import { useEffect, useState, type ReactNode } from "react";
import type { Trip } from "@trip/schema";
import { categoryIcon } from "./categories.ts";
import { sv } from "./sv.ts";
import { IconButton } from "./Icons.tsx";
import { CatIcon, ICONS } from "./CatIcon.tsx";
import { HiddenText, TextEye } from "./TripView.tsx";
import { api } from "./api.ts";
import { cardImage, creditMark, wishDetail } from "./wishes.ts";

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
export function DreamCard({ t, d, i, vote, votes = true, open, children }: { t: Trip; d: Trip["dreams"][number]; i: number; vote?: () => void; votes?: boolean; open?: () => void; children?: ReactNode }) {
  const pic = cardImage(d); // DB-09: the image in place of the icon
  const area = <>{pic ? <WishPicture tripId={t.id} file={pic.file} whole={pic.whole} /> : <CatIcon id={categoryIcon(d.category) ?? d.icon} big />}
    {creditMark(d) && <span className="picinfo" aria-hidden="true">i</span> /* DB-09: the credit is under Om önskan */}</>;
  const bg = { background: ICONS[d.category] ? `color-mix(in srgb, ${ICONS[d.category].color} 22%, var(--card))` : DREAM_BG[i % 3] };
  return (
    <article className="card dream">
      {open && !d.hidden ? <button type="button" className="img open" style={bg} aria-label={sv.wish.more(d.title)} title={creditMark(d) ? sv.wish.credited : undefined} onClick={open}>{area}</button>
        : <div className="img" style={bg}>{area}</div>}
      {votes && <button className="heart" onClick={vote} aria-label={sv.vote} disabled={!vote}>♥ {d.votes}</button>}
      <div className="in"><h3>{d.hidden ? <HiddenText /> : <>{d.title}<TextEye t={t} texts={[d.title, d.source]} /></>}</h3><span className="badge">{d.category}</span><div className="src">{d.source}</div>
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

export default function Dreams({ t, write, vote, addDream, editImage, open }: { t: Trip; write: boolean; vote: (i: number) => void; addDream: () => void; editImage: (id: string) => void; open: (id: string) => void }) {
  return <>
    <div className="dreams">{t.dreams.map((d, i) => <DreamCard key={d.id} t={t} d={d} i={i} vote={write ? () => vote(i) : undefined} open={() => open(d.id)}>
      {write && !d.hidden && <div className="wishtools"><IconButton icon="image" look="bare" tip="right" label={sv.wish.image(d.title)} onClick={() => editImage(d.id)} /></div> /* DB-10 */}
    </DreamCard>)}</div>
    {write && <IconButton icon="plus" look="fab" tip="up" label={sv.addDream} onClick={addDream} />}
  </>;
}
