import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Op, Settings, Trip } from "@trip/schema";
import { api, ApiError, askedForAdmin, chooseLink, copy, deviceLinks, forgetLink, installed, linkKey, needsChoice, offlineState, onOffline, type Me } from "./api.ts";
import { keptForecast, offlineText } from "./offline.ts";
import { forInstalled, permsFor, safariUrl } from "./access.ts";
import { applyOps } from "@trip/schema/src/ops.ts";
import { EDIT_KINDS, editTitle, type EditDlg } from "./editKinds.ts";

// Dialog contents load on first use, which keeps the page file under 200 KB (PF-01).
const EditDialog = lazy(() => import("./NalaForms.tsx").then((m) => ({ default: m.EditDialog })));
const PlaceView = lazy(() => import("./Panels.tsx").then((m) => ({ default: m.PlaceView })));
const TransportView = lazy(() => import("./Panels.tsx").then((m) => ({ default: m.TransportView })));
const HiddenView = lazy(() => import("./HiddenView.tsx"));
import { anyUnlocked, excerpt, jumpTo, LOCKED, scrollBehavior, toggleAll, toggleOne, tripDates, type Open, type Unlock } from "./format.ts";
import { forecastUrl, parseForecast, type Forecast } from "./weather.ts";
import { TripView, type Run, type Tab } from "./TripView.tsx";
import { defaultTab, todayIn } from "./today.ts";
import { newExpense, parseAmount, pickAdder, type Transfer } from "./money.ts";
import { Gear, IconButton } from "./Icons.tsx";

// The settings views, the trip's settings page and the login load when first opened (PF-01).
const AiSettings = lazy(() => import("./Settings.tsx").then((m) => ({ default: m.AiSettings })));
const AdminPage = lazy(() => import("./Admin.tsx").then((m) => ({ default: m.AdminPage })));
const Login = lazy(() => import("./Admin.tsx").then((m) => ({ default: m.Login })));
const Choose = lazy(() => import("./Choose.tsx"));
import { CATEGORIES } from "./categories.ts";
import { sv } from "./sv.ts";

type Dlg = null | { kind: "place"; id: string } | { kind: "transport"; dayId: string } | { kind: "dream" } | { kind: "expense" } | { kind: "payment" } | { kind: "person" } | EditDlg;
const dlgTitle = { dream: sv.newDream, expense: sv.newExpense, payment: sv.newPayment, person: sv.newPerson };
const ADDER_KEY = "mytrip.adder";
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

/** One forecast request per opened trip (WX-11, PF-03). Failures hide the weather (WX-14), unless the phone kept the last
 * one for the trip, which is shown with the time it was fetched (PW-10). */
function useForecast(trip: Trip | undefined): [Record<string, Forecast>, string | undefined] {
  const [fc, setFc] = useState<Record<string, Forecast>>({});
  const [at, setAt] = useState<string>();
  useEffect(() => {
    setFc({}); setAt(undefined);
    const days = trip?.days.filter((d) => d.weather) ?? [];
    if (!days.length) return;
    let live = true;
    fetch(forecastUrl(days.map((d) => d.weather!)))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const per = j ? parseForecast(j) : [];
        const next = Object.fromEntries(days.flatMap((d, i) => (per[i]?.[d.date] ? [[d.id, per[i][d.date]]] : [])));
        if (live) setFc(next);
        if (j) copy.save({ forecast: { tripId: trip!.id, days: next } });
      }, () => {
        const kept = keptForecast<Forecast>(copy.load(), trip!.id);
        if (live && kept) { setFc(kept.days); setAt(kept.at); }
      });
    return () => { live = false; };
  }, [trip?.id, JSON.stringify(trip?.days.map((d) => [d.id, d.date, d.weather]))]); // eslint-disable-line react-hooks/exhaustive-deps -- refetch when days or places change (ED-04)
  return [fc, at];
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined); // undefined: asking, null: no access (AU-07)
  const [expired, setExpired] = useState(false);
  const [choosing, setChoosing] = useState(false); // the start page with the trips of the links on the phone (PW-16)
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
  const [unlock, setUnlock] = useState<Unlock>(LOCKED); // ED-13, ED-18: a trip opens with every part locked
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsBack, setSettingsBack] = useState<"portal" | "admin">("portal");
  const [settings, setSettings] = useState<Settings & { aiService: boolean }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const load = useCallback(() => api.trips().then(setTrips, () => setFailed(true)), []);
  const start = useCallback(function go(): void {
    if (needsChoice()) { setChoosing(true); return; } // several links on the phone: the start page asks which trip (PW-16)
    api.me().then(setMe, (e) => {
      if (!(e instanceof ApiError && e.status === 401)) return setFailed(true);
      const had = !askedForAdmin && linkKey() !== null; // a link that no longer works (AU-07)
      forgetLink(); // it leaves the phone (PW-17)
      if (had && deviceLinks().length) { setNotice(sv.choose.gone); return go(); }
      setExpired(had);
      setMe(null);
    });
  }, []);
  /** Opens the trip of one link on the phone, or goes back to choosing one (PW-16). */
  const pick = (key: string | null) => {
    chooseLink(key); setMe(undefined); setTrips(null); setView("portal"); setChoosing(false);
    if (key) start(); else setChoosing(true);
  };
  useEffect(() => { start(); }, [start]);
  useEffect(() => {
    if (!me) return;
    load();
    if (!permsFor(me.role, {}).scoped) api.settings().then(setSettings, () => {}); // links see no app settings (AU-03, AU-12, AU-14)
  }, [me, load]);
  const role = me?.role ?? "link";
  /** The pages shown: only Uppleva in the app on the home screen (PW-15). */
  const pagePerms = (x: Parameters<typeof permsFor>[1]) => (installed ? forInstalled(permsFor(role, x)) : permsFor(role, x));
  const self = me && "travelerId" in me ? me.travelerId : undefined; // the traveler of a personal link (AU-13)
  useEffect(() => { // with a network again, the trip is fetched at once (PW-04)
    if (!me) return;
    addEventListener("online", load);
    return () => removeEventListener("online", load);
  }, [load, me]);
  useEffect(() => { // TK-10: changes from other devices show up within 30 seconds
    const id = setInterval(() => { if (me && document.visibilityState === "visible" && !dialog.current?.open) load(); }, 30_000);
    return () => clearInterval(id);
  }, [load, me]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 6000); return () => clearTimeout(id); }, [notice]);
  const saveSettings = (next: Settings) => {
    setSettings((s) => s && { ...s, ...next }); // optimistic; the server answer wins
    api.saveSettings(next).then((saved) => setSettings((s) => s && { ...s, ...saved }), () => api.settings().then(setSettings, () => {}));
  };
  const aiCard = settings && <Suspense fallback={null}><AiSettings s={settings} service={settings.aiService} onChange={saveSettings} /></Suspense>;
  const t = trips?.find((x) => x.id === tripId);
  const covers = useCovers(trips ?? []);
  const [forecast, forecastAt] = useForecast(view === "trip" ? t : undefined);
  const [off, setOff] = useState(offlineState()); // PW-04
  useEffect(() => onOffline(() => setOff(offlineState())), []);
  const today = t ? todayIn(t.timezone) : "";

  useEffect(() => {
    const d = dialog.current!;
    setErr("");
    if (dlg && !d.open) { opener.current = document.activeElement as HTMLElement; d.showModal(); }
    if (!dlg && d.open) d.close();
    document.body.style.overflow = dlg ? "hidden" : ""; // PL-14
  }, [dlg]);
  useEffect(() => {
    if (!scrollTo) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`day-${scrollTo}`)?.scrollIntoView({ block: "start", behavior: scrollBehavior(reduced) });
    setScrollTo(null);
  }, [scrollTo]);

  const openTrip = (id: string, nextTab?: Tab) => {
    const x = trips?.find((y) => y.id === id);
    setTripId(id); setView("trip"); setOpen({}); setUpDay(null); setUnlock(LOCKED);
    const tab = nextTab ?? (x ? defaultTab(x.days, todayIn(x.timezone)) : "nala"); // MT-09
    const allowed = pagePerms(x ?? {}).pages;
    setTab(allowed.includes(tab) ? tab : allowed[0] ?? "up"); // only the pages the role may see (AU-20)
    window.scrollTo(0, 0);
  };
  useEffect(() => { // a link opens its trip directly, on the tab of the trip's phase (AU-03, MT-09)
    if (me && "tripId" in me && trips && view !== "trip" && trips.some((x) => x.id === me.tripId)) openTrip(me.tripId);
  }, [me, trips]); // eslint-disable-line react-hooks/exhaustive-deps -- openTrip is recreated every render
  const logout = async () => { await api.logout().catch(() => {}); setTrips(null); setView("portal"); setMe(null); };
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
    const category = String(f.get("category"));
    change([{ op: "add", path: "dreams/-", value: { id, title, category, source: sv.manual, icon: "✨", votes: 0 } }], "add dream");
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
  /** Inline edits (checkboxes, packing items): retried once with fresh data after a conflict; errors show as a notice. */
  const run: Run = async (build, reason) => {
    let cur = t!;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = build(cur);
      if (!Array.isArray(r) && !r.ok) return setNotice(r.error);
      const ops = Array.isArray(r) ? r : r.ops;
      setTrips((ts) => ts && ts.map((x) => (x.id === cur.id ? applyOps(x, ops) : x))); // show at once; the reload brings the server's truth
      try {
        await api.change(cur, ops, reason);
        await load();
        return;
      } catch (e) {
        if (attempt === 0 && e instanceof ApiError && e.status === 409) {
          const fresh = (await api.trips()).find((x) => x.id === cur.id);
          if (fresh) { cur = fresh; continue; }
        }
        setNotice([sv.couldNotSave, ...(e instanceof ApiError ? e.problems : [])].join(" "));
        await load();
        return;
      }
    }
  };
  const savePayment = (x: Transfer & { note?: string }) =>
    change([{ op: "add", path: "payments/-", value: { id: newId("pay"), ...x, date: today } }], "payment");
  const saveForm = (kind: "expense" | "payment" | "person", form: HTMLFormElement) => {
    const f = new FormData(form), str = (k: string) => String(f.get(k) ?? "").trim();
    if (kind === "person") {
      const name = str("name"); // the same traveler from Summera and the settings (MI-01, AU-26)
      import("./edit.ts").then((m) => run((x) => m.addTraveler(x, name), "add traveler"));
    } else if (kind === "expense") {
      const payer = self ?? str("paidBy"); // a personal link pays and adds in its own name; the superuser picks who paid (UP-13, AU-13)
      const input = { text: str("text"), amount: str("amount"), category: str("category"), paidBy: payer, sharedBy: t!.travelers.map((x) => x.id), addedBy: payer }; // shared by all; split in Summera (MI-02)
      const r = newExpense(t!, input, today, new Date().toISOString(), newId("exp"));
      if (!r.ok) return setErr(r.error);
      if (!self) try { localStorage.setItem(`${ADDER_KEY}.${t!.id}`, payer); } catch { /* not remembered in private mode */ }
      change(r.ops, "add expense");
    } else {
      const amount = parseAmount(str("amount"));
      if (Number.isNaN(amount)) return setErr(sv.badAmount); // MI-03
      if (str("from") === str("to")) return;
      savePayment({ from: str("from"), to: str("to"), amount, ...(str("note") ? { note: str("note") } : {}) });
    }
    setDlg(null);
  };
  const people = (field: string, pick = 0, value = t?.travelers[pick]?.id) => (
    <select name={field} defaultValue={value}>{t?.travelers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
  );

  /** The traveler the superuser last chose as payer on this device, if still on the trip (UP-13). */
  const adder = () => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(`${ADDER_KEY}.${t?.id}`); } catch { /* storage blocked */ }
    return pickAdder(t?.travelers ?? [], stored);
  };

  let page;
  if (choosing) page = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Choose onPick={pick} /></Suspense>;
  else if (failed) page = <p className="ro">{sv.error}</p>;
  else if (me === null) page = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Login expired={expired} onDone={() => { setExpired(false); start(); }} /></Suspense>;
  else if (!trips) page = <p className="ro">{sv.loading}</p>;
  else if (view === "settings") page = <>
    <div className="top"><IconButton icon="back" label={sv.back} onClick={() => setView(settingsBack)} tip="right" /></div><h1>{sv.settings}</h1>
    {aiCard}
  </>;
  else if (view === "portal" || !t) page = <>
    <div className="top"><div className="logo">{sv.hub}</div><div className="topr"><span className="chip">{sv.family}</span><Gear onClick={() => { setSettingsBack("portal"); setView("settings"); }} />
      <IconButton icon="logout" label={sv.login.logout} onClick={logout} tip="left" /></div></div>
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
  else if (view === "admin") page = (
    <Suspense fallback={<p className="ro">{sv.loading}</p>}>
      <AdminPage t={t} superuser={permsFor(role, t).superuser} settings={settings} back={() => setView("trip")} edit={setDlg} addPerson={() => setDlg({ kind: "person" })} change={change} run={run} removeTrip={removeTrip}
        openSettings={() => { setSettingsBack("admin"); setView("settings"); }} />
    </Suspense>
  );
  else page = (
    <TripView
      t={t} cover={covers[t.id]} tab={tab} open={open} chart={chart} forecast={forecast} forecastAt={forecastAt}
      setTab={setTab} toggleDay={(id) => setOpen((o) => toggleOne(o, id))} toggleAll={() => setOpen((o) => toggleAll(o, t.days.map((d) => d.id)))}
      jump={(id) => { setOpen(jumpTo(id)); setScrollTo(id); }} toggleChart={() => setChart((c) => !c)}
      place={(id) => setDlg({ kind: "place", id })} transport={(dayId) => setDlg({ kind: "transport", dayId })} run={run}
      vote={(i) => change([{ op: "set", path: `dreams/${i}/votes`, value: t.dreams[i].votes + 1 }], "vote")}
      addDream={() => setDlg({ kind: "dream" })} back={() => setView("portal")} toChooser={permsFor(role, t).scoped && deviceLinks().length > 1 ? () => pick(null) : undefined} admin={() => setView("admin")}
      today={today} upDay={upDay} setUpDay={setUpDay}
      addExpense={() => setDlg({ kind: "expense" })} addPerson={() => setDlg({ kind: "person" })}
      edit={setDlg} unlock={unlock} setUnlock={setUnlock} perms={pagePerms(t)} self={self} fullApp={installed && permsFor(role, t).pages.length > 1 ? () => { location.href = safariUrl(location.origin, linkKey()); } : undefined}
      who={me && "travelerId" in me ? { name: t.travelers.find((x) => x.id === me.travelerId)?.name ?? me.travelerId, role: me.role }
        : me?.role === "link" ? { name: sv.who.follower, role: "follower" } : undefined}
      addPayment={(x) => (x ? savePayment(x) : setDlg({ kind: "payment" }))} // MI-06: one action from a proposal
    />
  );

  return <>
    <div className="wrap">{off && <div className="offline" role="status">{offlineText(off.at, new Date(), t?.timezone ?? "Europe/Stockholm")}</div>}{page}</div>
    {notice && <div className="toast" role="alert">{notice}</div>}
    <dialog
      ref={dialog} aria-label={!dlg ? undefined
        : dlg.kind === "place" ? t?.places.find((x) => x.id === dlg.id)?.name
        : dlg.kind === "transport" ? sv.transport
        : dlg.kind in dlgTitle ? dlgTitle[dlg.kind as keyof typeof dlgTitle] : editTitle(dlg as EditDlg)}
      onClose={() => { setDlg(null); opener.current?.focus(); }}
      onClick={(e) => { // backdrop clicks land on the dialog itself, outside its box (PL-12)
        const r = e.currentTarget.getBoundingClientRect();
        if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) setDlg(null);
      }}
    >
      {dlg && <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={() => setDlg(null)} /></span>}
      <Suspense fallback={<p className="ro">{sv.loading}</p>}>
      {dlg?.kind === "place" && t && <PlaceView t={t} id={dlg.id} edit={t && permsFor(role, t).view.nala.plan === "write" && view === "trip" && tab === "nala" && anyUnlocked(unlock) ? () => setDlg({ kind: "placeEdit", id: dlg.id }) : undefined} />}
      {dlg?.kind === "transport" && t && <TransportView key={dlg.dayId} t={t} dayId={dlg.dayId} />}
      {dlg?.kind === "hidden" && t && <HiddenView t={t} dayId={dlg.dayId} id={dlg.id} />}
      {dlg?.kind === "dream" && (
        <form onSubmit={(e) => { e.preventDefault(); saveDream(e.currentTarget); }}>
          <h3>{sv.newDream}</h3>
          <label>{sv.title}<input name="title" autoFocus /></label>
          <label>{sv.category}<select name="category">{CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}</select></label>
          <button className="btn" type="submit">{sv.save}</button>
        </form>
      )}
      {dlg && t && EDIT_KINDS.includes(dlg.kind) && (
        <EditDialog key={JSON.stringify(dlg)} dlg={dlg as EditDlg} t={t} save={apply} close={() => setDlg(null)} self={self} />
      )}
      </Suspense>
      {(dlg?.kind === "expense" || dlg?.kind === "payment" || dlg?.kind === "person") && (
        <form onSubmit={(e) => { e.preventDefault(); saveForm(dlg.kind, e.currentTarget); }}>
          <h3>{dlgTitle[dlg.kind]}</h3>
          {dlg.kind === "person" && <label>{sv.name}<input name="name" autoFocus /></label>}
          {dlg.kind === "expense" && <>
            <label>{sv.text}<input name="text" autoFocus /></label>
            <label>{sv.amount}<input name="amount" inputMode="decimal" /></label>
            <label>{sv.category}<select name="category">{sv.budgetCategories.map((c) => <option key={c}>{c}</option>)}</select></label>
            {!self && <label>{sv.paidBy}{people("paidBy", 0, adder())}</label>}
          </>}
          {dlg.kind === "payment" && <>
            <label>{sv.from}{people("from")}</label>
            <label>{sv.to}{people("to", 1)}</label>
            <label>{sv.amount}<input name="amount" inputMode="decimal" autoFocus /></label>
            <label>{sv.note}<input name="note" /></label>
          </>}
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" type="submit">{sv.save}</button>
        </form>
      )}
    </dialog>
  </>;
}
