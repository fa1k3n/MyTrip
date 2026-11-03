import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Op, Settings, Trip } from "@trip/schema";
import { api, ApiError, askedForAdmin, chooseLink, copy, deviceLinks, forgetDeviceAccount, forgetLink, installed, linkKey, needsChoice, isOffline, offlineState, onOffline, queue, sendVerdicts, sendWaiting, verdictQueue, type AiAdded, type Me } from "./api.ts";
import { noAnswer, dequeue, enqueue, keptForecast, offlineText, retry, sendTrip, waitingFor, withVerdicts, withWaiting, type Expense, type Waiting } from "./offline.ts";
import { APP_VERSION, NEWS_KEY, usedBefore, whatsNewFor } from "./version.ts";
import { ABOUT_PAGE, forInstalled, freshAgain, installedTab, landsOnAbout, needsConsent, needsFullApp, parseSetupHash, permsFor, roleIn, safariUrl, seenKey, showInstallHint, whoChip } from "./access.ts";
import { applyOps } from "@trip/schema/src/ops.ts";
import { canUndo, undoOps, UNDOABLE } from "./undo.ts";
import { tripChanges } from "./changes.ts";
import { EDIT_KINDS, editTitle, type EditDlg } from "./editKinds.ts";

// Dialog contents load on first use, which keeps the page file under 200 KB (PF-01).
const EditDialog = lazy(() => import("./NalaForms.tsx").then((m) => ({ default: m.EditDialog })));
import { confirmPlaceOps } from "./place.ts";
const PlaceView = lazy(() => import("./Panels.tsx").then((m) => ({ default: m.PlaceView })));
const TransportView = lazy(() => import("./Panels.tsx").then((m) => ({ default: m.TransportView })));
const HiddenView = lazy(() => import("./HiddenView.tsx"));
const TicketView = lazy(() => import("./TicketView.tsx"));
import { aiDoneText, excerpt, memoriesLine, jumpTo, newReply, scrollBehavior, toggleAll, toggleOne, tripDates, type Open } from "./format.ts";
import { forecastUrl, parseForecast, pastDays, type Forecast } from "./weather.ts";
import { TripView, type Run, type Tab } from "./TripView.tsx";
import { defaultTab, todayIn } from "./today.ts";
import { burst, burstLabel } from "./celebrate.ts";
import { activityCategory, activityExpense, defaultSharers, newExpense, plainExpense, parseAmount, pickAdder, wishExpense, type Transfer } from "./money.ts";
import { ExpenseSheet, ReceiptButton, type Choice } from "./ExpenseFields.tsx";
import { BetaButton, Gear, IconButton, TripRoles } from "./Icons.tsx";

// The settings views, the trip's settings page and the login load when first opened (PF-01).
const AiSettings = lazy(() => import("./Settings.tsx").then((m) => ({ default: m.AiSettings })));
const AppAdmin = lazy(() => import("./Settings.tsx").then((m) => ({ default: m.AppAdmin })));
const AdminPage = lazy(() => import("./Admin.tsx").then((m) => ({ default: m.AdminPage })));
const Login = lazy(() => import("./Admin.tsx").then((m) => ({ default: m.Login })));
const WhatsNewDialog = lazy(() => import("./WhatsNew.tsx").then((m) => ({ default: m.WhatsNewDialog }))); // US-41
const ConsentPage = lazy(() => import("./Admin.tsx").then((m) => ({ default: m.ConsentPage }))); // US-26
const FeedbackDialog = lazy(() => import("./Feedback.tsx").then((m) => ({ default: m.FeedbackDialog }))); // US-27
const NewTripDialog = lazy(() => import("./NewTrip.tsx").then((m) => ({ default: m.NewTripDialog }))); // AI-10
const SetupPassword = lazy(() => import("./Admin.tsx").then((m) => ({ default: m.SetupPassword }))); // US-05
const Choose = lazy(() => import("./Choose.tsx"));
const NoticeSettings = lazy(() => import("./NoticeSettings.tsx"));
const WishImage = lazy(() => import("./WishImage.tsx")); // DB-05..DB-08
const WishView = lazy(() => import("./Dreams.tsx").then((m) => ({ default: m.WishView }))); // DB-15
import { CATEGORIES } from "./categories.ts";
import { sv } from "./sv.ts";
import { ask } from "./Ask.tsx"; // UI-11
import { newWish, toFill } from "./wishes.ts";
import type { Drafted } from "./NewTrip.tsx";
import { onOutside } from "./outside.ts";

const filling = new Set<string>(); // wishes already sent for an automatic image on this page (DB-07)

type Dlg = null | { kind: "place"; id: string } | { kind: "transport"; dayId: string } | { kind: "dream" } | { kind: "expense"; short: { currency: string; activity?: { id: string; text: string; category?: string; dreamId?: string; activityId?: string }; payer?: boolean; choices?: Choice[]; guess?: string } } | { kind: "payment" } | { kind: "person"; id?: string } | { kind: "notices" } | { kind: "wishImage"; id: string } | EditDlg;
const dlgTitle = { wishImage: sv.wish.find, dream: sv.newDream, expense: sv.newExpense, payment: sv.newPayment, person: sv.newPerson, notices: sv.notice.title };
const ADDER_KEY = "mytrip.adder";
const HINT_KEY = "mytrip.installHint";
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
    fetch(forecastUrl(days.map((d) => d.weather!), pastDays(days.map((d) => d.date), todayIn(trip!.timezone))))
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
  const [setupLink, setSetupLink] = useState(() => parseSetupHash(location.hash)); // a password link was opened (US-04)
  const [feedbackOpen, setFeedbackOpen] = useState(false); // "Tyck till" during the beta (US-27)
  const [news, setNews] = useState(() => { // US-41: the news of a new version, once per device that used an earlier one
    let seen: string | null = null;
    try { seen = localStorage.getItem(NEWS_KEY); } catch { /* storage blocked: usedBefore is false, nothing shown */ }
    return whatsNewFor(APP_VERSION, seen, usedBefore());
  });
  const closeNews = () => { try { localStorage.setItem(NEWS_KEY, APP_VERSION); } catch { /* blocked */ } setNews(undefined); };
  const [newOpen, setNewOpen] = useState(false); // AI-10: "Beskriv din dröm"
  const aiRun = useRef<{ tripId: string; before: Trip; undone: boolean } | null>(null); // AI-80: the trip before "Skapa med AI", for Ångra of all it added
  const [choosing, setChoosing] = useState(false); // the start page with the trips of the links on the phone (PW-16)
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<"portal" | "trip" | "admin" | "settings">("portal");
  const [tripId, setTripId] = useState("");
  const [tab, setTab] = useState<Tab>("nala");
  const [open, setOpen] = useState<Open>({});
  const [dlg, setDlg] = useState<Dlg>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [upDay, setUpDay] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<{ text: string; before: Trip; after: Trip; draft?: boolean } | null>(null); // ED-22: for 10 seconds after a change; 30 for a draft (AI-78)
  const [settingsBack, setSettingsBack] = useState<"portal" | "admin">("portal");
  const [settings, setSettings] = useState<Settings & { aiService: boolean }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const origin = useRef<Element | null>(null); // the button that opened Uppleva's expense form, for the burst (UP-35)
  const opener = useRef<HTMLElement | null>(null);

  const load = useCallback(() => api.trips().then(setTrips, () => setFailed(true)), []);
  const start = useCallback(function go(): void {
    if (needsChoice()) { setChoosing(true); return; } // several links on the phone: the start page asks which trip (PW-16)
    api.me().then(setMe, (e) => {
      if (!(e instanceof ApiError && e.status === 401)) return setFailed(true);
      const had = !askedForAdmin && linkKey() !== null; // a link that no longer works (AU-07)
      forgetLink(); // it leaves the phone (PW-17)
      if (had && deviceLinks().length) { setNotice(sv.choose.gone); return go(); }
      if (landsOnAbout(location.hash, had, askedForAdmin)) { location.replace(ABOUT_PAGE); return; } // UI-20
      if (location.hash === "#login") history.replaceState(null, "", location.pathname + location.search);
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
  /** The role on a trip: a user's differs per trip (US-14, US-22); without a trip, the start page's. */
  const roleOf = (id?: string) => (me ? roleIn(me, id) : { role: "link" as const });
  const account = !!me && "user" in me;
  const perms = (x: { id?: string; access?: Trip["access"] }) => permsFor(roleOf(x.id).role, x, account);
  const { role, travelerId: self } = roleOf(tripId || undefined); // self: the traveler of a personal link or a tied user (AU-13, US-22)
  /** The pages shown: Önska, Uppleva and Minnas in the app on the home screen (PW-24). */
  const pagePerms = (x: { id?: string; access?: Trip["access"] }) => (installed ? forInstalled(perms(x)) : perms(x));
  const [waiting, setWaiting] = useState<Waiting[]>([]); // expenses on the phone that the server does not have yet (PW-06)
  const [verdicts, setVerdicts] = useState(verdictQueue.load); // verdicts given without a network (UP-53)
  useEffect(() => verdictQueue.listen(() => setVerdicts(verdictQueue.load())), []);
  const [sending, setSending] = useState(0); // sends going on: "Skickar…" on the waiting rows (PW-19)
  const flushWaiting = useCallback(async () => {
    if (!me) return;
    const tripId = sendTrip(me, linkKey()); // also when logged in as admin with a link on the phone (PW-20); an account's carry their trip (PW-22)
    setSending((n) => n + 1);
    try { if (await sendWaiting(tripId)) load(); } finally { setSending((n) => n - 1); } // PW-07
    if (verdictQueue.load().length && await sendVerdicts()) load(); // UP-53
    setWaiting(queue.load());
  }, [me, load]);
  const changeWaiting = (next: Waiting[]) => { queue.save(next); setWaiting(next); flushWaiting(); }; // PW-09: try again, remove
  useEffect(() => { // with a network again, the trip is fetched at once and waiting expenses are sent (PW-04, PW-07)
    if (!me) return;
    setWaiting(queue.load());
    flushWaiting();
    const back = () => { load(); flushWaiting(); };
    addEventListener("online", back);
    return () => removeEventListener("online", back);
  }, [load, me, flushWaiting]);
  const hiddenAt = useRef<number>();
  useEffect(() => { // PW-25: back after an hour or more in the background, the phone app starts over on Uppleva and today
    if (!installed) return;
    const seen = () => {
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); return; }
      if (!freshAgain(hiddenAt.current, Date.now())) return;
      hiddenAt.current = undefined;
      const x = trips?.find((y) => y.id === tripId);
      if (view === "trip" && x) { setTab(installedTab(pagePerms(x).pages) ?? "up"); setUpDay(null); window.scrollTo(0, 0); }
    };
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }); // eslint-disable-line react-hooks/exhaustive-deps -- reads the current trip and view each time
  useEffect(() => { // TK-10: changes from other devices show up within 30 seconds
    const id = setInterval(() => { if (me && document.visibilityState === "visible" && !dialog.current?.open) { load(); flushWaiting(); } }, 30_000);
    return () => clearInterval(id);
  }, [load, me]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 6000); return () => clearTimeout(id); }, [notice]);
  useEffect(() => { if (!undo) return; const id = setTimeout(() => setUndo(null), undo.draft ? 30000 : 10000); return () => clearTimeout(id); }, [undo]);
  const saveSettings = (next: Settings) => {
    setSettings((s) => s && { ...s, ...next }); // optimistic; the server answer wins
    api.saveSettings(next).then((saved) => setSettings((s) => s && { ...s, ...saved }), () => api.settings().then(setSettings, () => {}));
  };
  const aiCard = settings && <Suspense fallback={null}><AiSettings s={settings} service={settings.aiService} onChange={saveSettings} /></Suspense>;
  const t = trips?.find((x) => x.id === tripId);
  const covers = useCovers(trips ?? []);
  const [forecast, forecastAt] = useForecast(view === "trip" ? t : undefined);
  useEffect(() => { if (trips) import("./ticketFiles.ts").then((m) => m.keepTickets(trips), () => {}); }, [trips]); // BK-12
  const [off, setOff] = useState(offlineState()); // PW-04
  const [hint, setHint] = useState(() => { // PW-12: once per phone, until closed
    let closed = false;
    try { closed = localStorage.getItem(HINT_KEY) === "closed"; } catch { /* storage blocked: shown each visit */ }
    return showInstallHint(navigator.userAgent, installed, closed);
  });
  const closeHint = () => { setHint(false); try { localStorage.setItem(HINT_KEY, "closed"); } catch { /* storage blocked */ } };
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
    setTripId(id); setView("trip"); setOpen({}); setUpDay(null);
    const allowed = pagePerms(x ?? {}).pages;
    const tab = nextTab ?? (installed ? installedTab(allowed) : undefined) ?? (x ? defaultTab(x.days, todayIn(x.timezone)) : "nala"); // MT-09; the phone app: Uppleva (PW-25)
    setTab(allowed.includes(tab) ? tab : allowed[0] ?? "up"); // only the pages the role may see (AU-20)
    window.scrollTo(0, 0);
  };
  useEffect(() => { // a link opens its trip directly, on the tab of the trip's phase (AU-03, MT-09)
    if (me && "tripId" in me && trips && view !== "trip" && trips.some((x) => x.id === me.tripId)) openTrip(me.tripId);
  }, [me, trips]); // eslint-disable-line react-hooks/exhaustive-deps -- openTrip is recreated every render
  /** "Tyck till" for an account that accepted the beta notice (US-26, US-27). */
  const consenting = !!me && "user" in me && !!me.consent;
  const [answered, setAnswered] = useState(""); // US-34: the latest answer to one's feedback, and whether it is new on this device
  const ANSWER_SEEN = "mytrip.answerSeen", seenAnswer = () => { try { return localStorage.getItem(ANSWER_SEEN); } catch { return null; } };
  useEffect(() => {
    if (!consenting) return;
    api.myNotes().then((ns) => setAnswered(newReply(ns, seenAnswer()) ? ns.map((n) => n.replyAt ?? "").sort().at(-1)! : ""), () => {});
  }, [consenting, feedbackOpen]);
  const beta = consenting ? () => {
    setFeedbackOpen(true);
    if (answered) { try { localStorage.setItem(ANSWER_SEEN, answered); } catch { /* blocked: the dot stays */ } setAnswered(""); }
  } : undefined;
  useEffect(() => { // US-28: which of the four pages a consenting user opens, once per trip, page and day
    if (!me || !("user" in me) || !me.consent || view !== "trip" || !tripId) return;
    const k = seenKey(tripId, tab), today = new Date().toISOString().slice(0, 10);
    try { if (localStorage.getItem(k) === today) return; localStorage.setItem(k, today); } catch { /* storage blocked: send anyway, the server keeps one a day */ }
    api.seen(tripId, tab).catch(() => {});
  }, [me, view, tab, tripId]);
  const logout = async () => {
    const n = queue.load().length;
    if (n && !(await ask(`${sv.login.logoutAsk} ${sv.choose.unsent(n)}`, { ok: sv.login.logout }))) return; // PW-23
    await api.logout().catch(() => {});
    forgetDeviceAccount(); setWaiting([]); setTrips(null); setView("portal"); setMe(null);
  };
  const change = (ops: Parameters<typeof api.change>[1], reason: string) => api.change(t!, ops, reason).finally(load);
  const newTrip = () => setNewOpen(true);
  /** AI-10: a trip with its draft opens on Nåla with Ångra for the draft (AI-78); one without, on Drömmar. */
  const created = async (id: string, msg?: string, drafted?: Drafted) => {
    setNewOpen(false);
    if (drafted && aiRun.current?.tripId !== id) aiRun.current = { tripId: id, before: drafted.before, undone: false }; // before any await: the helpers may be done (AI-82)
    await load();
    openTrip(id, drafted ? "nala" : "dr");
    if (drafted && !aiRun.current?.undone) setUndo((u) => (u?.draft && u.after.id === id ? u : { text: sv.newTripAi.drafted, ...drafted, draft: true }));
    if (msg) setNotice(msg);
  };
  /** Sets a trip made with AI back to its state before the draft, built on the latest trip (AI-78, AI-80). */
  const undoAi = async (tripId: string) => {
    const r = aiRun.current, fresh = (await api.trips()).find((x) => x.id === tripId);
    if (!r || r.tripId !== tripId || !fresh) return;
    r.undone = true;
    await api.change(fresh, undoOps(r.before, fresh), "undo");
  };
  /** AI-80: what a helper added shows when it comes; when the trip was set back meanwhile, it is taken out again. */
  const helperDone = (tripId: string) => {
    if (aiRun.current?.tripId === tripId && aiRun.current.undone) void undoAi(tripId).catch(() => {}).then(load);
    else void load();
  };
  /** AI-82: the notice of what the AI added, with Ångra for all of it. */
  const allDone = async (tripId: string, added: AiAdded, from: string[] = []) => {
    const r = aiRun.current, fresh = (await api.trips().catch(() => [])).find((x) => x.id === tripId);
    if (r?.tripId !== tripId || r.undone || !fresh) return;
    setNotice("");
    setUndo({ text: [aiDoneText(added), memoriesLine(from)].filter(Boolean).join(" "), before: r.before, after: fresh, draft: true }); // AI-91
  };
  /** AI for the draft: the service, the main switch and Ändra mina planer (AI-07), for a user allowed AI (US-16). */
  const draftAi = !!settings?.aiService && !!settings.ai.enabled && settings.ai.areas.changes !== false;
  /** AI in an area for the trip on screen: the service and its area (AI-07), allowed for the user (US-16), the trip's switch and consent (AI-62, AI-64). */
  const aiFor = (area: "mail" | "receipts", x = t) => !!settings?.aiService && !!settings.ai.enabled && settings.ai.areas[area] !== false && !!x?.aiConsent && x.ai !== false;
  const removeTrip = async () => {
    if (!(await ask(sv.confirmDelete))) return;
    await api.remove(tripId); setView("portal"); load();
  };
  const saveDream = (form: HTMLFormElement) => {
    const f = new FormData(form), str = (k: string) => String(f.get(k) ?? "");
    const id = `dream-${Date.now().toString(36)}`, r = newWish({ title: str("title"), category: str("category"), url: str("url") }, id); // DB-05
    if (!r.ok) return setErr(r.error);
    filling.add(id);
    change(r.ops, "add dream").then(() => api.autoWishImage(t!.id, id)).then(load, () => {}); // DB-07: an image at once, changed with the image button
    setDlg(null);
  };
  useEffect(() => { // DB-07: wishes without an image get one once, one at a time, when someone who changes wishes opens Önska
    if (!t || view !== "trip" || tab !== "dr" || perms(t).view.dr.dreams !== "write") return;
    const todo = toFill(t).filter((id) => !filling.has(id));
    if (!todo.length) return;
    todo.forEach((id) => filling.add(id));
    (async () => { for (const id of todo) await api.autoWishImage(t.id, id).catch(() => {}); load(); })();
  }, [t, view, tab, role, load]);
  /** ED-22: after a move, a planned wish or a removal in Nåla, Ångra for a while; not when the change removed files. */
  const offerUndo = (before: Trip, ops: Op[], reason: string) => {
    if (!UNDOABLE.has(reason)) return;
    let after: Trip;
    try { after = { ...applyOps(before, ops), revision: before.revision + 1 }; } catch { return; }
    if (!canUndo(before, after)) return;
    const c = tripChanges(before, after)[0];
    setUndo({ text: reason === "keep ai" ? sv.aiReview.kept : c ? `${sv.undo.kinds[c.kind]} ${c.text}` : reason, before, after }); // AI-83: keeping changes no text
  };
  const runUndo = async () => {
    const u = undo;
    setUndo(null);
    if (!u) return;
    try { await (u.draft ? undoAi(u.after.id) : api.change(u.after, undoOps(u.before, u.after), "undo")); } catch { setNotice(sv.undo.failed); } // AI-78: all the AI added, also what comes later (AI-80)
    await load();
  };
  /** Edits from the Nåla forms: the error text or null (ED-10). */
  const apply = async (ops: Op[], reason: string): Promise<string | null> => {
    try {
      await api.change(t!, ops, reason);
      offerUndo(t!, ops, reason);
      await load();
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { await load(); return sv.conflict; }
      return [sv.couldNotSave, ...(e instanceof ApiError ? e.problems : [])].join(" ");
    }
  };
  /** BK-17: saving a booking from a mail approves the mail; the trash rejects it. */
  const approveMail = async (pid: string, ops: Op[]): Promise<string | null> => {
    try {
      await api.approveMail(t!, pid, ops);
      await load();
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { await load(); return sv.conflict; }
      return [sv.couldNotSave, ...(e instanceof ApiError ? e.problems : [])].join(" ");
    }
  };
  /** MC-18: a proposal from an LLM client is applied by the server; its problems come back in the result. */
  const approveProposal = async (pid: string): Promise<string | null> => {
    try {
      const r = await api.approve(t!.id, pid);
      await load();
      return r.result.problems?.length ? [sv.couldNotSave, ...r.result.problems].join(" ") : null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { await load(); return e.problems.includes("day gone") ? sv.aiRun.dayGone : sv.proposal.stale; } // AI-77
      return [sv.couldNotSave, ...(e instanceof ApiError ? e.problems : [])].join(" ");
    }
  };
  const rejectMail = async (pid: string) => { await api.rejectMail(t!.id, pid).catch(() => setNotice(sv.couldNotSave)); await load(); };
  /** BK-33: a mailed wish becomes the booking proposal of its kept mail, after asking. */
  const wishToBooking = async (id: string) => {
    if (!(await ask(sv.mail.toBookingAsk, { ok: sv.mail.toBooking }))) return;
    try { await api.wishToBooking(t!.id, id); setDlg(null); setNotice(sv.mail.movedToBooking); }
    catch (e) { setNotice(e instanceof ApiError && e.status === 404 ? sv.mail.noMailKept : e instanceof ApiError && e.status === 409 ? sv.mail.wishInUse : sv.couldNotSave); }
    await load();
  };
  const mailToWish = async (pid: string) => { // BK-29; a wish the trip already has leaves the mail pending (DB-27)
    await api.mailToWish(t!.id, pid).catch((e) => setNotice(e instanceof ApiError && e.problems.includes("duplicate") ? sv.mail.wishExists : sv.couldNotSave));
    await load();
  };
  /** Inline edits (checkboxes, packing items): retried once with fresh data after a conflict; errors show as a notice. */
  const run: Run = async (build, reason, offline) => {
    let cur = t!;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = build(cur);
      if (!Array.isArray(r) && !r.ok) return setNotice(r.error);
      const ops = Array.isArray(r) ? r : r.ops;
      setTrips((ts) => ts && ts.map((x) => (x.id === cur.id ? applyOps(x, ops) : x))); // show at once; the reload brings the server's truth
      try {
        await api.change(cur, ops, reason);
        offerUndo(cur, ops, reason);
        await load();
        return;
      } catch (e) {
        if (attempt === 0 && e instanceof ApiError && e.status === 409) {
          const fresh = (await api.trips()).find((x) => x.id === cur.id);
          if (fresh) { cur = fresh; continue; }
        }
        if (offline && noAnswer(e)) { offline(); await load(); return; } // UP-54: kept on the phone instead
        setNotice([sv.couldNotSave, ...(e instanceof ApiError ? e.problems : [])].join(" "));
        await load();
        return;
      }
    }
  };
  const savePayment = (x: Transfer & { note?: string }) =>
    change([{ op: "add", path: "payments/-", value: { id: newId("pay"), ...x, date: today } }], "payment");
  const saveForm = async (kind: "expense" | "payment" | "person", form: HTMLFormElement) => {
    const f = new FormData(form), str = (k: string) => String(f.get(k) ?? "").trim();
    if (kind === "person") {
      const name = str("name"), id = dlg?.kind === "person" ? dlg.id : undefined; // the same traveler from Summera and the settings (MI-01, AU-26); a new name (AU-32)
      import("./edit.ts").then((m) => run((x) => (id ? m.renameTraveler(x, id, name) : m.addTraveler(x, name)), id ? "rename traveler" : "add traveler"));
    } else if (kind === "expense") {
      const short = dlg?.kind === "expense" ? dlg.short : undefined, activity = short?.activity; // the short form (UP-22, UP-30, MI-13)
      const payer = self ?? (short?.payer ? str("paidBy") : adder()); // a personal link pays and adds in its own name; the superuser picks who paid in Summera (UP-13, AU-13)
      const all = defaultSharers(t!.travelers); // shared by all who share costs (MI-02, MI-38)
      const cur = str("currency") || t!.currency;
      const day = /^\d{4}-\d{2}-\d{2}$/.test(str("date")) ? str("date") : today; // the receipt's date (AI-42)
      const rate = cur === t!.currency ? undefined : await (await import("./currency.ts")).rateFor(cur, t!.currency, day); // UP-25
      const queued = !!linkKey() || account; // kept on the phone: it may wait for its rate (UP-49)
      if (rate === null && !queued) return setErr(sv.up.noRate(cur));
      const foreign = rate ? { currency: cur, rate: rate.rate, rateDate: rate.date } : rate === null ? { currency: cur } : undefined;
      const wish = activity ? undefined : short?.choices?.find((x) => x.id === str("dream")); // the wish chosen in the sheet (UP-47)
      const typed = { text: str("text"), amount: str("amount") };
      const input = { ...(activity ? activityExpense(activity, typed, payer, all) // the card's activity and its wish (UP-22, UP-23, UP-47)
        : wish ? wishExpense(wish, { ...typed, category: str("category") || activityCategory(wish.category) }, payer, all) // the tiles can change the category
        : plainExpense({ text: str("text"), amount: str("amount"), category: str("category") }, payer, all)), ...(foreign ? { foreign } : {}) }; // shared by all; split in Summera (MI-02)
      const r = newExpense(t!, input, day, new Date().toISOString(), newId("exp"));
      if (!r.ok) return setErr(r.error);
      if (!self && short?.payer) try { localStorage.setItem(`${ADDER_KEY}.${t!.id}`, payer); } catch { /* not remembered in private mode */ }
      if (queued) { // kept on the phone at once and sent from there, with or without a network (PW-06, PW-07, PW-22)
        queue.save(enqueue(queue.load(), r.ops[0].value as Expense, linkKey() ? undefined : t!.id, t!.currency));
        setWaiting(queue.load());
        flushWaiting();
      } else change(r.ops, "add expense");
      { // after the dialog has closed, over the button that opened it (UP-35)
        const at = origin.current, label = burstLabel(r.ops[0].value as Expense, t!.currency, (activity ?? wish)?.text); // UP-44
        setTimeout(() => burst(at, label), 80);
      }
    } else {
      const amount = parseAmount(str("amount"));
      if (Number.isNaN(amount)) return setErr(sv.badAmount); // MI-03
      if (str("from") === str("to")) return;
      savePayment({ from: str("from"), to: str("to"), amount, ...(str("note") ? { note: str("note") } : {}) });
    }
    setDlg(null);
  };
  const currencyField = (preset: string) => <label>{sv.currency}<span className="rolepick field"><select name="currency" defaultValue={preset}>
    {[...new Set([preset, t!.currency, ...sv.currencies])].map((c) => <option key={c}>{c}</option>)}</select></span></label>; // UP-23, UP-34
  const people = (field: string, pick = 0, value = t?.travelers[pick]?.id) => (
    <select name={field} defaultValue={value}>{t?.travelers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
  );

  const [, setAdderTick] = useState(0);
  /** The superuser's pick of traveler, kept on the device for expenses and memories (UP-13, MI-17). */
  const setAdder = (id: string) => { try { localStorage.setItem(`${ADDER_KEY}.${t?.id}`, id); } catch { /* private mode */ } setAdderTick((n) => n + 1); };
  /** The traveler the superuser last chose as payer on this device, if still on the trip (UP-13). */
  const adder = () => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(`${ADDER_KEY}.${t?.id}`); } catch { /* storage blocked */ }
    return pickAdder(t?.travelers ?? [], stored ?? (me && "user" in me && t ? me.trips[t.id]?.travelerId ?? null : null)); // US-22: an owner who travels pays first
  };

  let page;
  if (setupLink) page = <Suspense fallback={<p className="ro">{sv.loading}</p>}><SetupPassword user={setupLink.user} secret={setupLink.secret}
    onDone={() => { history.replaceState(null, "", location.pathname + location.search); setSetupLink(null); setMe(undefined); start(); }} /></Suspense>;
  else if (me && needsConsent(me)) page = <Suspense fallback={<p className="ro">{sv.loading}</p>}><ConsentPage onDone={() => { setMe(undefined); start(); }} logout={logout} /></Suspense>; // US-26
  else if (choosing) page = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Choose onPick={pick} /></Suspense>;
  else if (failed) page = <p className="ro">{sv.error}</p>;
  else if (me === null) page = <Suspense fallback={<p className="ro">{sv.loading}</p>}><Login expired={expired} onDone={() => { setExpired(false); start(); }} /></Suspense>;
  else if (!trips) page = <p className="ro">{sv.loading}</p>;
  else if (view === "settings") page = <>
    <div className="top"><IconButton icon="back" label={sv.back} onClick={() => setView(settingsBack)} tip="right" /></div><h1>{sv.settings}</h1>
    {aiCard}
    {me && roleIn(me, undefined).role === "admin" && <Suspense fallback={null}><AppAdmin /></Suspense>} {/* MT-13, US-02 */}
  </>;
  else if (view === "portal" || !t) page = <>
    <div className="top"><div className="logo">{sv.hub}</div><div className="topr">{me && <span className="chip">{whoChip(me)}</span>}{beta && <BetaButton onClick={beta} dot={!!answered} />}<Gear onClick={() => { setSettingsBack("portal"); setView("settings"); }} />
      <IconButton icon="logout" label={sv.login.logout} onClick={logout} tip="left" /></div></div>
    <div className="grid">
      {trips.map((x) => (
        <button className="card trip" key={x.id} onClick={() => openTrip(x.id)}>
          {covers[x.id] && <img className="cover" src={covers[x.id]} alt="" />}
          <h3>{x.title}</h3><div className="ro">{tripDates(x)}</div><p className="sum">{excerpt(x.purpose)}</p>
          {me && <TripRoles me={me} id={x.id} />}
        </button>
      ))}
      <button className="card new" onClick={newTrip}>{sv.newTrip}</button>
    </div>
  </>;
  else if (view === "admin") page = (
    <Suspense fallback={<p className="ro">{sv.loading}</p>}>
      <AdminPage t={t} superuser={perms(t).superuser} manager={perms(t).manager} back={() => setView("trip")} edit={setDlg} addPerson={(id?: string) => setDlg({ kind: "person", id })} change={change} reload={load} run={run} removeTrip={removeTrip}
        openSettings={() => { setSettingsBack("admin"); setView("settings"); }} />
    </Suspense>
  );
  else page = (
    <TripView
      t={withVerdicts(withWaiting(t, waiting) as Trip, verdicts)} waiting={waitingFor(waiting, t.id)} sending={sending > 0} retryWaiting={(id) => changeWaiting(retry(queue.load(), id))} removeWaiting={(id) => changeWaiting(dequeue(queue.load(), id))}
      cover={covers[t.id]} tab={tab} open={open} forecast={forecast} forecastAt={forecastAt}
      setTab={setTab} toggleDay={(id) => setOpen((o) => toggleOne(o, id))} toggleAll={() => setOpen((o) => toggleAll(o, t.days.map((d) => d.id)))}
      jump={(id) => { setOpen(jumpTo(id)); setScrollTo(id); }} openDays={(ids) => { setOpen(Object.fromEntries(ids.map((id) => [id, true]))); if (ids[0]) setScrollTo(ids[0]); }}
      place={(id) => setDlg({ kind: "place", id })} transport={(dayId) => setDlg({ kind: "transport", dayId })} run={run}
      vote={(i) => change([{ op: "set", path: `dreams/${i}/votes`, value: t.dreams[i].votes + 1 }], "vote")}
      addDream={() => setDlg({ kind: "dream" })} editImage={(id) => setDlg({ kind: "wishImage", id })} back={() => setView("portal")} toChooser={perms(t).scoped && deviceLinks().length > 1 ? () => pick(null) : undefined} admin={() => setView("admin")}
      today={today} upDay={upDay} setUpDay={setUpDay} bar={installed}
      addExpense={() => { origin.current = document.activeElement; setDlg({ kind: "expense", short: { currency: t.currency, payer: true } }); }} addShortExpense={(currency, activity, pick) => { origin.current = document.activeElement; setDlg({ kind: "expense", short: { currency, activity, ...pick } }); }} notices={() => setDlg({ kind: "notices" })}
      edit={setDlg} perms={pagePerms(t)} self={self}
      memoryBy={self ?? (perms(t).manager ? adder() || undefined : undefined)} setMemoryBy={setAdder} fullApp={installed && needsFullApp(perms(t)) ? () => { location.href = safariUrl(location.origin, linkKey()); } : undefined}
      who={self && (role === "traveler" || role === "planner") ? { name: t.travelers.find((x) => x.id === self)?.name ?? self, role }
        : me?.role === "link" ? { name: sv.who.follower, role: "follower" } : undefined}
      addPayment={(x) => (x ? savePayment(x) : setDlg({ kind: "payment" }))} // MI-06: one action from a proposal
      review={{ approve: approveProposal, reject: rejectMail }} // MC-18
      feedback={beta}
      feedbackDot={!!answered}
    />
  );

  return <>
    <div className="wrap">{off && <div className="offline" role="status">{offlineText(off.at, new Date(), t?.timezone ?? "Europe/Stockholm")}</div>}
      {hint && view === "trip" && <div className="card hint" role="note"><p>{sv.installHint}</p><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={closeHint} /></div>}
      {page}</div>
    {notice && <div className="toast" role="alert">{notice}</div>}
    {newOpen && <Suspense fallback={null}><NewTripDialog ai={draftAi} created={(id, msg, drafted) => void created(id, msg, drafted)} helperDone={helperDone} allDone={(id, added, from) => void allDone(id, added, from)} close={() => setNewOpen(false)} /></Suspense>}
    {feedbackOpen && <Suspense fallback={null}><FeedbackDialog page={view === "trip" ? tab : view} tripId={view === "portal" ? undefined : t?.id} close={() => setFeedbackOpen(false)}
      news={sv.whatsNew.news[APP_VERSION] ? () => { setFeedbackOpen(false); setNews(APP_VERSION); } : undefined} /></Suspense>}
    {news && me && !needsConsent(me) && !setupLink && !choosing && <Suspense fallback={null}><WhatsNewDialog version={news} close={closeNews} /></Suspense>} {/* US-41 */}
    {undo && !notice && <div className="toast undo" role="status"><span>{undo.text}</span><button type="button" className="btn ghost" onClick={runUndo}>{sv.undo.button}</button></div>}
    <dialog
      ref={dialog} className={dlg?.kind === "tickets" ? "full" : dlg?.kind === "expense" && !dlg.short.activity ? "sheet" : undefined} aria-label={!dlg ? undefined
        : dlg.kind === "place" ? t?.places.find((x) => x.id === dlg.id)?.name
        : dlg.kind === "transport" ? sv.transport
        : dlg.kind in dlgTitle ? dlgTitle[dlg.kind as keyof typeof dlgTitle] : editTitle(dlg as EditDlg)}
      onClose={() => { setDlg(null); opener.current?.focus(); }}
      onClick={onOutside(() => setDlg(null))}
    >
      {dlg && <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={() => setDlg(null)} /></span>}
      <Suspense fallback={<p className="ro">{sv.loading}</p>}>
      {dlg?.kind === "place" && t && <PlaceView t={t} id={dlg.id} edit={t && perms(t).view.nala.plan === "write" && view === "trip" && tab === "nala" ? () => setDlg({ kind: "placeEdit", id: dlg.id }) : undefined}
        confirm={t && perms(t).view.nala.plan === "write" ? () => run((cur) => confirmPlaceOps(cur, dlg.id), "place checked") : undefined} />}
      {dlg?.kind === "transport" && t && <TransportView key={dlg.dayId} t={t} dayId={dlg.dayId} />}
      {dlg?.kind === "hidden" && t && <HiddenView t={t} dayId={dlg.dayId} id={dlg.id} />}
      {dlg?.kind === "notices" && t && <NoticeSettings tripId={t.id} />}
      {dlg?.kind === "tickets" && t && <TicketView t={t} bookingId={dlg.bookingId} />}
      {dlg?.kind === "wish" && t && <WishView t={t} id={dlg.id} toBooking={perms(t).settings ? () => void wishToBooking(dlg.id) : undefined} />}
      {dlg?.kind === "wishImage" && t && <WishImage key={dlg.id} t={t} id={dlg.id} change={change} done={() => { setDlg(null); load(); }} />}
      {dlg?.kind === "dream" && (
        <form onSubmit={(e) => { e.preventDefault(); saveDream(e.currentTarget); }}>
          <h3>{sv.newDream}</h3>
          <label>{sv.title}<input name="title" autoFocus /></label>
          <label>{sv.category}<select name="category">{CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}</select></label>
          <label>{sv.wish.url}<input name="url" type="url" inputMode="url" placeholder="https://" /></label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" type="submit">{sv.save}</button>
        </form>
      )}
      {dlg && t && EDIT_KINDS.includes(dlg.kind) && (
        <EditDialog key={JSON.stringify(dlg)} dlg={dlg as EditDlg} t={t} save={apply} close={() => setDlg(null)} self={self} approveMail={approveMail} rejectMail={rejectMail} mailToWish={mailToWish} aiRead={aiFor("mail")} wishes={perms(t).view.dr.dreams === "write"} />
      )}
      </Suspense>
      {(dlg?.kind === "expense" || dlg?.kind === "payment" || dlg?.kind === "person") && (
        <form key={JSON.stringify(dlg)} onSubmit={(e) => { e.preventDefault(); saveForm(dlg.kind, e.currentTarget); }}>
          {dlg.kind === "expense" && !dlg.short.activity && <small className="kicker">{sv.up.sheetKicker}</small> /* UP-42 */}
          <h3>{dlg.kind === "expense" && dlg.short.activity ? sv.up.expenseTitle(dlg.short.activity.text) : dlg.kind === "person" && dlg.id ? sv.renamePerson : dlgTitle[dlg.kind]}</h3>
          {dlg.kind === "person" && <label>{sv.name}<input name="name" autoFocus defaultValue={dlg.id ? t?.travelers.find((x) => x.id === dlg.id)?.name : undefined} /></label>}
          {dlg.kind === "expense" && t && aiFor("receipts") && !isOffline() && <ReceiptButton tripId={t.id} currencies={[...new Set([dlg.short.currency, t.currency, ...sv.currencies])]} /> /* AI-42 */}
          {dlg.kind === "expense" && dlg.short.activity && <> {/* an activity's expense: amount, currency and a short description (UP-22, UP-30) */}
            <div className="two">
              <label>{sv.amount.replace(" (kr)", "")}<input name="amount" inputMode="decimal" autoFocus /></label>
              {currencyField(dlg.short.currency)}
            </div>
            <label>{sv.up.shortText}<input name="text" maxLength={60} placeholder={dlg.short.activity.text} /></label>
          </>}
          {dlg.kind === "expense" && !dlg.short.activity && /* without a fixed activity: its own sheet, guessing the activity (UP-30, UP-42, UP-43) */
            <ExpenseSheet choices={dlg.short.choices} guess={dlg.short.guess} currency={currencyField(dlg.short.currency)}
              payer={dlg.short.payer && !self ? <label>{sv.paidBy}<span className="rolepick field">{people("paidBy", 0, adder())}</span></label> : undefined /* Summera: the superuser picks who paid (MI-13, UP-13) */} />}
          {dlg.kind === "payment" && <>
            <label>{sv.from}{people("from")}</label>
            <label>{sv.to}{people("to", 1)}</label>
            <label>{sv.amount}<input name="amount" inputMode="decimal" autoFocus /></label>
            <label>{sv.note}<input name="note" /></label>
          </>}
          {err && <p className="err" role="alert">{err}</p>}
          <button className={`btn${dlg.kind === "expense" && !dlg.short.activity ? " wide" : ""}`} type="submit">{dlg.kind === "expense" && !dlg.short.activity ? sv.up.saveExpense : sv.save}</button>
        </form>
      )}
    </dialog>
  </>;
}
