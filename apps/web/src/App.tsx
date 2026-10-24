import { useCallback, useEffect, useRef, useState } from "react";
import type { Trip } from "@trip/schema";
import { api, maskedToken } from "./api.ts";
import { excerpt, jumpTo, scrollBehavior, toggleAll, toggleOne, tripDates, type Open } from "./format.ts";
import { forecastUrl, parseForecast, type Forecast } from "./weather.ts";
import { TripView, type Tab } from "./TripView.tsx";
import { sv } from "./sv.ts";

type Dlg = null | { kind: "place"; name: string; address: string } | { kind: "dream" };

/** Cover images need the auth header, so they are fetched as blobs. */
function useCovers(trips: Trip[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const started = useRef(new Set<string>());
  useEffect(() => {
    for (const t of trips) {
      const key = `${t.id}/${t.image}`;
      if (!t.image || started.current.has(key)) continue;
      started.current.add(key);
      api.image(t.id).then((u) => setUrls((m) => ({ ...m, [t.id]: u })), () => {});
    }
  }, [trips]);
  return urls;
}

/** One forecast request per opened trip (WX-11, PF-03). Failures hide the weather (WX-14). */
function useForecast(trip: Trip | undefined) {
  const [fc, setFc] = useState<Record<string, Forecast>>({});
  useEffect(() => {
    setFc({});
    const days = trip?.days.filter((d) => d.weather) ?? [];
    if (!days.length) return;
    let live = true;
    fetch(forecastUrl(days.map((d) => d.weather!)))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const per = j ? parseForecast(j) : [];
        if (live) setFc(Object.fromEntries(days.flatMap((d, i) => (per[i]?.[d.date] ? [[d.id, per[i][d.date]]] : []))));
      }, () => {});
    return () => { live = false; };
  }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return fc;
}

export function App() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<"portal" | "trip" | "admin">("portal");
  const [tripId, setTripId] = useState("");
  const [tab, setTab] = useState<Tab>("nala");
  const [open, setOpen] = useState<Open>({});
  const [chart, setChart] = useState(true);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const load = useCallback(() => api.trips().then(setTrips, () => setFailed(true)), []);
  useEffect(() => { load(); }, [load]);
  const t = trips?.find((x) => x.id === tripId);
  const covers = useCovers(trips ?? []);
  const forecast = useForecast(view === "trip" ? t : undefined);

  useEffect(() => {
    const d = dialog.current!;
    if (dlg && !d.open) { opener.current = document.activeElement as HTMLElement; d.showModal(); }
    if (!dlg && d.open) d.close();
  }, [dlg]);
  useEffect(() => {
    if (!scrollTo) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`day-${scrollTo}`)?.scrollIntoView({ block: "start", behavior: scrollBehavior(reduced) });
    setScrollTo(null);
  }, [scrollTo]);

  const openTrip = (id: string, nextTab?: Tab) => {
    setTripId(id); setView("trip"); setOpen({});
    if (nextTab) setTab(nextTab);
    window.scrollTo(0, 0);
  };
  const change = (ops: Parameters<typeof api.change>[1], reason: string) => api.change(t!, ops, reason).finally(load);
  const newTrip = async () => { const n = await api.create(sv.newTripTitle); await load(); openTrip(n.id, "dr"); };
  const removeTrip = async () => {
    if (!confirm(sv.confirmDelete)) return;
    await api.remove(tripId); setView("portal"); load();
  };
  const saveDream = (form: HTMLFormElement) => {
    const f = new FormData(form), title = String(f.get("title") ?? "").trim();
    if (!title) return;
    const id = `dream-${Date.now().toString(36)}`;
    change([{ op: "add", path: "dreams/-", value: { id, title, category: String(f.get("category")), source: sv.manual, icon: "✨", votes: 0 } }], "add dream");
    setDlg(null);
  };

  let page;
  if (failed) page = <p className="ro">{sv.error}</p>;
  else if (!trips) page = <p className="ro">{sv.loading}</p>;
  else if (view === "portal" || !t) page = <>
    <div className="top"><div className="logo">{sv.hub}</div><span className="chip">{sv.family}</span></div>
    <div className="grid">
      {trips.map((x) => (
        <button className="card trip" key={x.id} onClick={() => openTrip(x.id)}>
          {covers[x.id] && <img className="cover" src={covers[x.id]} alt="" />}
          <h3>{x.title}</h3><div className="ro">{tripDates(x)}</div><p className="sum">{excerpt(x.purpose)}</p>
        </button>
      ))}
      <button className="card new" onClick={newTrip}>{sv.newTrip}</button>
    </div>
  </>;
  else if (view === "admin") page = <>
    <div className="top"><button className="btn ghost" onClick={() => setView("trip")}>{sv.back}</button></div><h1>{sv.admin}</h1>
    <div className="card">
      {t.inbox && <><h3>{sv.inbox}</h3><p>{sv.inboxText} <b>{t.inbox}</b></p></>}
      <h3>{sv.apiKey}</h3><p>{maskedToken()}</p>
    </div>
    <div className="card danger"><h3>{sv.danger}</h3><button className="btn red" onClick={removeTrip}>{sv.deleteTrip}</button></div>
  </>;
  else page = (
    <TripView
      t={t} cover={covers[t.id]} tab={tab} open={open} chart={chart} forecast={forecast}
      setTab={setTab} toggleDay={(id) => setOpen((o) => toggleOne(o, id))} toggleAll={() => setOpen((o) => toggleAll(o, t.days.map((d) => d.id)))}
      jump={(id) => { setOpen(jumpTo(id)); setScrollTo(id); }} toggleChart={() => setChart((c) => !c)}
      place={(name, address) => setDlg({ kind: "place", name, address })}
      vote={(i) => change([{ op: "set", path: `dreams/${i}/votes`, value: t.dreams[i].votes + 1 }], "vote")}
      addDream={() => setDlg({ kind: "dream" })} back={() => setView("portal")} admin={() => setView("admin")}
    />
  );

  return <>
    <div className="wrap">{page}</div>
    <dialog
      ref={dialog} aria-label={dlg?.kind === "place" ? dlg.name : sv.newDream}
      onClose={() => { setDlg(null); opener.current?.focus(); }}
      onClick={(e) => { // backdrop clicks land on the dialog itself, outside its box (PL-12)
        const r = e.currentTarget.getBoundingClientRect();
        if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) setDlg(null);
      }}
    >
      {dlg?.kind === "place" && <>
        <h3>{dlg.name}</h3><p>{dlg.address}</p><div className="map">{sv.mapLoading}</div><button className="btn" onClick={() => setDlg(null)}>{sv.close}</button>
      </>}
      {dlg?.kind === "dream" && (
        <form onSubmit={(e) => { e.preventDefault(); saveDream(e.currentTarget); }}>
          <h3>{sv.newDream}</h3>
          <label>{sv.title}<input name="title" autoFocus /></label>
          <label>{sv.category}<select name="category">{sv.dreamCategories.map((c) => <option key={c}>{c}</option>)}</select></label>
          <button className="btn" type="submit">{sv.save}</button>{" "}
          <button className="btn ghost" type="button" onClick={() => setDlg(null)}>{sv.cancel}</button>
        </form>
      )}
    </dialog>
  </>;
}
