import { useCallback, useEffect, useRef, useState } from "react";
import type { Op, Settings, Trip } from "@trip/schema";
import { api, ApiError, maskedToken } from "./api.ts";
import { EditDialog, editTitle, type EditDlg } from "./NalaForms.tsx";
import { excerpt, jumpTo, scrollBehavior, toggleAll, toggleOne, tripDates, type Open } from "./format.ts";
import { forecastUrl, parseForecast, type Forecast } from "./weather.ts";
import { TripView, type Tab } from "./TripView.tsx";
import { defaultTab, todayIn } from "./today.ts";
import { parseAmount, sharedByValue, type Transfer } from "./money.ts";
import { AiSettings, Gear, TripAi } from "./Settings.tsx";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";

type Dlg = null | { kind: "place"; name: string; address: string } | { kind: "dream" } | { kind: "expense" } | { kind: "payment" } | { kind: "person" } | EditDlg;
const dlgTitle = { dream: sv.newDream, expense: sv.newExpense, payment: sv.newPayment, person: sv.newPerson };
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;

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
  }, [trip?.id, JSON.stringify(trip?.days.map((d) => [d.id, d.date, d.weather]))]); // eslint-disable-line react-hooks/exhaustive-deps -- refetch when days or places change (ED-04)
  return fc;
}

export function App() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<"portal" | "trip" | "admin" | "settings">("portal");
  const [tripId, setTripId] = useState("");
  const [tab, setTab] = useState<Tab>("nala");
  const [open, setOpen] = useState<Open>({});
  const [chart, setChart] = useState(true);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [upDay, setUpDay] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [settingsBack, setSettingsBack] = useState<"portal" | "admin">("portal");
  const [settings, setSettings] = useState<Settings & { aiService: boolean }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const load = useCallback(() => api.trips().then(setTrips, () => setFailed(true)), []);
  useEffect(() => { load(); api.settings().then(setSettings, () => {}); }, [load]);
  const saveSettings = (next: Settings) => {
    setSettings((s) => s && { ...s, ...next }); // optimistic; the server answer wins
    api.saveSettings(next).then((saved) => setSettings((s) => s && { ...s, ...saved }), () => api.settings().then(setSettings, () => {}));
  };
  const aiCard = settings && <AiSettings s={settings} service={settings.aiService} onChange={saveSettings} />;
  const t = trips?.find((x) => x.id === tripId);
  const covers = useCovers(trips ?? []);
  const forecast = useForecast(view === "trip" ? t : undefined);
  const today = t ? todayIn(t.timezone) : "";

  useEffect(() => {
    const d = dialog.current!;
    setErr("");
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
    const x = trips?.find((y) => y.id === id);
    setTripId(id); setView("trip"); setOpen({}); setUpDay(null);
    setTab(nextTab ?? (x ? defaultTab(x.days, todayIn(x.timezone)) : "nala")); // MT-09
    window.scrollTo(0, 0);
  };
  const change = (ops: Parameters<typeof api.change>[1], reason: string) => api.change(t!, ops, reason).finally(load);
  const newTrip = async () => {
    const n = await api.create(sv.newTripTitle);
    setTrips((ts) => [...(ts ?? []), n]);
    openTrip(n.id, "dr");
    load();
  };
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
  /** Edits from the Nåla forms: the error text or null (ED-10). */
  const apply = async (ops: Op[], reason: string): Promise<string | null> => {
    try {
      await api.change(t!, ops, reason);
      await load();
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { await load(); return sv.conflict; }
      return [sv.couldNotSave, ...(e instanceof ApiError ? e.problems : [])].join(" ");
    }
  };
  const savePayment = (x: Transfer & { note?: string }) =>
    change([{ op: "add", path: "payments/-", value: { id: newId("pay"), ...x, date: today } }], "payment");
  const saveForm = (kind: "expense" | "payment" | "person", form: HTMLFormElement) => {
    const f = new FormData(form), str = (k: string) => String(f.get(k) ?? "").trim();
    if (kind === "person") {
      if (!str("name")) return;
      change([{ op: "add", path: "travelers/-", value: { id: newId("p"), name: str("name"), packing: [] } }], "add traveler");
    } else {
      const amount = parseAmount(str("amount"));
      if (Number.isNaN(amount)) return setErr(sv.badAmount); // MI-03
      if (kind === "expense") {
        if (!str("text")) return;
        const sharedBy = sharedByValue(f.getAll("sharedBy").map(String), t!.travelers.map((x) => x.id));
        change([{ op: "add", path: "expenses/-", value: { id: newId("exp"), text: str("text"), category: str("category"), amount, paidBy: str("paidBy"), sharedBy, date: today } }], "add expense");
      } else {
        if (str("from") === str("to")) return;
        savePayment({ from: str("from"), to: str("to"), amount, ...(str("note") ? { note: str("note") } : {}) });
      }
    }
    setDlg(null);
  };
  const people = (field: string, pick = 0) => (
    <select name={field} defaultValue={t?.travelers[pick]?.id}>{t?.travelers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
  );

  let page;
  if (failed) page = <p className="ro">{sv.error}</p>;
  else if (!trips) page = <p className="ro">{sv.loading}</p>;
  else if (view === "settings") page = <>
    <div className="top"><IconButton icon="back" label={sv.back} onClick={() => setView(settingsBack)} tip="right" /></div><h1>{sv.settings}</h1>
    {aiCard}
  </>;
  else if (view === "portal" || !t) page = <>
    <div className="top"><div className="logo">{sv.hub}</div><div className="topr"><span className="chip">{sv.family}</span><Gear onClick={() => { setSettingsBack("portal"); setView("settings"); }} /></div></div>
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
    <div className="top"><IconButton icon="back" label={sv.back} onClick={() => setView("trip")} tip="right" /></div><h1>{sv.admin}</h1>
    <div className="card"><h3>{sv.tripDetails}</h3><div className="row mid"><span>{t.title}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editTrip} onClick={() => setDlg({ kind: "trip" })} /></div></div>
    <div className="card">
      {t.inbox && <><h3>{sv.inbox}</h3><p>{sv.inboxText} <b>{t.inbox}</b></p></>}
      <h3>{sv.apiKey}</h3><p>{maskedToken()}</p>
    </div>
    {settings && (
      <TripAi s={settings} on={t.ai} openSettings={() => { setSettingsBack("admin"); setView("settings"); }}
        onChange={(on) => change([{ op: "set", path: "ai", value: on }], on ? "AI on for trip" : "AI off for trip")} />
    )}
    <div className="card danger"><h3>{sv.danger}</h3><IconButton icon="trash" look="red" label={sv.deleteTrip} onClick={removeTrip} tip="right" /></div>
  </>;
  else page = (
    <TripView
      t={t} cover={covers[t.id]} tab={tab} open={open} chart={chart} forecast={forecast}
      setTab={setTab} toggleDay={(id) => setOpen((o) => toggleOne(o, id))} toggleAll={() => setOpen((o) => toggleAll(o, t.days.map((d) => d.id)))}
      jump={(id) => { setOpen(jumpTo(id)); setScrollTo(id); }} toggleChart={() => setChart((c) => !c)}
      place={(name, address) => setDlg({ kind: "place", name, address })}
      vote={(i) => change([{ op: "set", path: `dreams/${i}/votes`, value: t.dreams[i].votes + 1 }], "vote")}
      addDream={() => setDlg({ kind: "dream" })} back={() => setView("portal")} admin={() => setView("admin")}
      today={today} upDay={upDay} setUpDay={setUpDay}
      addExpense={() => setDlg({ kind: "expense" })} addPerson={() => setDlg({ kind: "person" })}
      edit={setDlg}
      addPayment={(x) => (x ? savePayment(x) : setDlg({ kind: "payment" }))} // MI-06: one action from a proposal
    />
  );

  return <>
    <div className="wrap">{page}</div>
    <dialog
      ref={dialog} aria-label={!dlg ? undefined : dlg.kind === "place" ? dlg.name : dlg.kind in dlgTitle ? dlgTitle[dlg.kind as keyof typeof dlgTitle] : editTitle(dlg as EditDlg)}
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
      {dlg && t && ["trip", "day", "activity", "booking", "budget"].includes(dlg.kind) && (
        <EditDialog key={JSON.stringify(dlg)} dlg={dlg as EditDlg} t={t} save={apply} close={() => setDlg(null)} />
      )}
      {(dlg?.kind === "expense" || dlg?.kind === "payment" || dlg?.kind === "person") && (
        <form onSubmit={(e) => { e.preventDefault(); saveForm(dlg.kind, e.currentTarget); }}>
          <h3>{dlgTitle[dlg.kind]}</h3>
          {dlg.kind === "person" && <label>{sv.name}<input name="name" autoFocus /></label>}
          {dlg.kind === "expense" && <>
            <label>{sv.text}<input name="text" autoFocus /></label>
            <label>{sv.amount}<input name="amount" inputMode="decimal" /></label>
            <label>{sv.category}<select name="category">{sv.budgetCategories.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>{sv.paidBy}{people("paidBy")}</label>
            <div className="ro">{sv.sharedBy}</div>
            {t?.travelers.map((x) => <label className="check" key={x.id}><input type="checkbox" name="sharedBy" value={x.id} defaultChecked />{x.name}</label>)}
          </>}
          {dlg.kind === "payment" && <>
            <label>{sv.from}{people("from")}</label>
            <label>{sv.to}{people("to", 1)}</label>
            <label>{sv.amount}<input name="amount" inputMode="decimal" autoFocus /></label>
            <label>{sv.note}<input name="note" /></label>
          </>}
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" type="submit">{sv.save}</button>{" "}
          <button className="btn ghost" type="button" onClick={() => setDlg(null)}>{sv.cancel}</button>
        </form>
      )}
    </dialog>
  </>;
}
