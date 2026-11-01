// The image dialog of a wish: search Wikimedia Commons with own words, see the image from our own server and choose it, upload an
// own photo, or remove the image (DB-05, DB-07, DB-12); loaded on demand.
import { useState } from "react";
import type { Op, Trip } from "@trip/schema";
import { api, type WishCredit } from "./api.ts";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";
import { ask } from "./Ask.tsx"; // UI-11
import { cardImage, removeImage, wishUrl } from "./wishes.ts";
import { WishPicture } from "./Dreams.tsx";
import { shrinkPhoto } from "./photo.ts";

const credit = (c: WishCredit) => [c.author, c.licence, sv.wish.commons].filter(Boolean).join(" · ");

export default function WishImage({ t, id, change, done }: { t: Trip; id: string; change: (ops: Op[], reason: string) => Promise<unknown>; done: () => void }) {
  const i = t.dreams.findIndex((w) => w.id === id), w = t.dreams[i];
  const [query, setQuery] = useState(w?.title ?? "");
  const [url, setUrl] = useState(w?.url ?? "");
  const [found, setFound] = useState<{ credit: WishCredit; preview: string; query: string } | null | undefined>();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  if (!w) return null;
  const now = cardImage(w);
  const find = async () => {
    setErr(""); setBusy(sv.wish.finding);
    try {
      const r = await api.findWishImage(t.id, id, query);
      if (r.failed) { setFound(undefined); setErr(sv.wish.busy); }
      else setFound(r.found && r.preview ? { credit: r.found, preview: r.preview, query } : null);
    } catch { setErr(sv.wish.failed); }
    setBusy("");
  };
  const act = async (label: string, f: () => Promise<unknown>) => {
    setErr(""); setBusy(label);
    try { await f(); done(); } catch { setErr(sv.wish.failed); }
    setBusy("");
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const blob = await shrinkPhoto(file); // DB-12: scaled down on the phone
    if (!blob) return setErr(sv.wish.badPhoto);
    act(sv.wish.uploading, () => api.uploadWishImage(t.id, id, blob));
  };
  const saveLink = () => {
    const u = wishUrl(url);
    if (u === null) return setErr(sv.wish.badUrl);
    if (u !== w.url) act(sv.wish.saveLink, () => change([u ? { op: "set", path: `dreams/${i}/url`, value: u } : { op: "remove", path: `dreams/${i}/url` }], "wish link"));
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); find(); }}>
      <h3>{sv.wish.image(w.title)}</h3>
      {now && <div className="wishnow"><WishPicture tripId={t.id} file={now.file} whole={now.whole} />
        <IconButton icon="trash" look="red" tip="left" label={sv.wish.remove} onClick={async () => { if (await ask(sv.wish.removeAsk)) act(sv.wish.remove, () => change(removeImage(i), "remove wish image")); }} /></div>}
      <p className="ro note">{sv.wish.hint}</p>
      <div className="lblrow"><label>{sv.wish.query}<input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus /></label>
        <button className="btn" type="submit" disabled={!!busy || !query.trim()}>{busy === sv.wish.finding ? busy : sv.wish.find}</button></div>
      {found === null && <p className="ro">{sv.wish.none}</p>}
      {found && <figure className="cand">
        <img src={found.preview} alt="" />
        <figcaption>{sv.wish.photoBy} {credit(found.credit)}</figcaption>
        <button className="btn" type="button" disabled={!!busy} onClick={() => act(sv.wish.use, () => api.chooseWishImage(t.id, id, found.query))}>{sv.wish.use}</button>
      </figure>}
      <label className="btn ghost upload">{busy === sv.wish.uploading ? busy : sv.wish.upload}
        <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} /></label>
      <div className="lblrow"><label>{sv.wish.url}<input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
        <button className="btn ghost" type="button" disabled={!!busy} onClick={saveLink}>{sv.wish.saveLink}</button></div>
      {err && <p className="err" role="alert">{err}</p>}
    </form>
  );
}
