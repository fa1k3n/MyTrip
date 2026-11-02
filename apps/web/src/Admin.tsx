// The trip's settings page, the admin login and the share link. Loaded on demand (PF-01).
import { useEffect, useState, type FormEvent } from "react";
import type { Op, Settings, Trip } from "@trip/schema";
import { api, ApiError, installed, type PersonLinkInfo } from "./api.ts";
import { linkFromText, missingLinks, personUrl, shareUrl } from "./access.ts";
import { DEFAULT_ACCESS, levelsFor, PAGE_PARTS, PAGES, type Level, type Page } from "@trip/schema/src/rules.ts";
import { tripRange } from "./edit.ts";
import { tripDates } from "./format.ts";
import { money } from "./budget.ts";
import { sharesOps } from "./money.ts";
import { IconButton } from "./Icons.tsx";
import { QrDialog } from "./QrDialog.tsx";
import { TripAi } from "./Settings.tsx";
import type { EditDlg } from "./editKinds.ts";
import type { Run } from "./TripView.tsx";
import { sv } from "./sv.ts";
import { ask } from "./Ask.tsx"; // UI-11
import { svAdmin } from "./sv-admin.ts";

/** Google's answer comes back in the fragment: no account, or the login failed (US-09). Read once and cleared. */
const googleAnswer = (() => {
  const h = location.hash;
  if (h !== "#login=nokonto" && h !== "#login=fel") return "";
  history.replaceState(null, "", location.pathname + location.search);
  return h === "#login=nokonto" ? sv.login.noAccount : sv.login.googleFailed;
})();

/** AU-04, AU-07, US-07..US-10, US-19: the login with address and password or Google, also shown when a link is missing or no longer
 * valid. Without an address, the password is the admin password (US-18). */
export function Login({ expired, onDone }: { expired: boolean; onDone: () => void }) {
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState(googleAnswer), [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  useEffect(() => { api.authConfig().then((c) => setGoogle(c.google), () => {}); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.login(pw, email);
      onDone();
    } catch (x) {
      const s = x instanceof ApiError ? x.status : 0;
      setErr(s === 401 ? sv.login.wrong : s === 429 ? sv.login.tooMany : s === 404 ? sv.login.off : sv.error);
    }
    setBusy(false);
  };
  return <>
    <div className="top"><div className="logo">{sv.hub}</div></div>
    <h1>{sv.login.title}</h1>
    <p className="ro">{expired ? sv.login.expired : sv.login.noLink}</p>
    <form className="card" onSubmit={submit}>
      <label>{sv.login.email}<input type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
      <label>{sv.login.password}<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" type="submit" disabled={busy || !pw}>{sv.login.submit}</button>
      {google && !installed && <a className="btn ghost google" href="/api/auth/google">{sv.login.google}</a>}
      {google && installed && <p className="ro note">{sv.login.googleInstalled}</p>}
    </form>
    {installed && <PasteLink />}
    <p className="ro"><a className="place" href="/om.html">{sv.login.about}</a></p> {/* UI-13 */}
  </>;
}

/** US-26: what a beta tester accepts: what is kept and who can see it. */
export const BetaNotice = () => <div className="betanotice">
  <p>{sv.beta.consentLead}</p>
  <ul>{sv.beta.consentPoints.map((t) => <li key={t}>{t}</li>)}</ul>
</div>;

/** US-26: an account that has not accepted the beta notice sees it before anything else. */
export function ConsentPage({ onDone, logout }: { onDone: () => void; logout: () => void }) {
  const [ok, setOk] = useState(false), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await api.consent(); onDone(); } catch { setErr(sv.error); }
    setBusy(false);
  };
  return <>
    <div className="top"><div className="logo">{sv.hub}</div><IconButton icon="logout" label={sv.login.logout} onClick={logout} tip="left" /></div>
    <h1>{sv.beta.consentTitle}</h1>
    <form className="card" onSubmit={submit}>
      <BetaNotice />
      <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> {sv.beta.consentCheck}</label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" type="submit" disabled={!ok || busy}>{sv.beta.consentGo}</button>
    </form>
  </>;
}

/** US-04, US-05: the password link opens this form; the password is chosen once, then the user is logged in. */
export function SetupPassword({ user, secret, onDone }: { user: string; secret: string; onDone: () => void }) {
  const [who, setWho] = useState<{ name: string; email: string } | null | undefined>(undefined);
  const [pw, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [ok, setOk] = useState(false);
  useEffect(() => { api.setupInfo(user, secret).then(setWho, () => setWho(null)); }, [user, secret]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ([...pw].length < 10) { setErr(sv.login.setShort); return; }
    setBusy(true);
    try { await api.setup(user, secret, pw, ok); onDone(); } catch (x) { setErr(x instanceof ApiError && x.status === 410 ? sv.login.setGone : sv.error); }
    setBusy(false);
  };
  return <>
    <div className="top"><div className="logo">{sv.hub}</div></div>
    <h1>{sv.login.setTitle}</h1>
    {who === undefined && <p className="ro">{sv.loading}</p>}
    {who === null && <p className="ro">{sv.login.setGone}</p>}
    {who && <form className="card" onSubmit={submit}>
      <p className="ro">{sv.login.setFor(who.name, who.email)}</p>
      <input type="email" autoComplete="username" value={who.email} readOnly hidden />
      <label>{sv.login.password}<input type="password" autoComplete="new-password" minLength={10} value={pw} onChange={(e) => { setPw(e.target.value); setErr(""); }} autoFocus /></label>
      <p className="ro note">{sv.login.min}</p>
      <h3>{sv.beta.consentTitle}</h3><BetaNotice /> {/* US-26 */}
      <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> {sv.beta.consentCheck}</label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" type="submit" disabled={busy || !pw || !ok}>{sv.login.setSave}</button>
    </form>}
  </>;
}

/** PW-02: the app on the home screen has storage of its own; if the link did not come along, it is pasted here once. */
function PasteLink() {
  const [text, setText] = useState(""), [err, setErr] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const hash = linkFromText(text);
    if (hash) location.hash = hash; // kept and used at once, as when the link is opened (AU-02, AU-23)
    else setErr(sv.login.badLink);
  };
  return <form className="card" onSubmit={submit}>
    <label>{sv.login.pasteLink}<input inputMode="url" autoComplete="off" value={text} onChange={(e) => { setText(e.target.value); setErr(""); }} /></label>
    {err && <p className="err" role="alert">{err}</p>}
    <button className="btn" type="submit" disabled={!text.trim()}>{sv.login.openLink}</button>
  </form>;
}

/** AU-06: the trip's share link, to copy or replace. Replacing it stops the old link at once. */
function ShareLink({ t }: { t: Trip }) {
  const [secret, setSecret] = useState<string | null | undefined>(undefined); // undefined: loading, null: none yet
  const [copied, setCopied] = useState(false), [showQr, setShowQr] = useState(false);
  useEffect(() => { api.link(t.id).then((r) => setSecret(r.secret), () => setSecret(null)); }, [t.id]);
  const url = secret ? shareUrl(location.origin, t.id, secret) : "";
  const make = async () => {
    if (secret && !(await ask(svAdmin.share.confirmReplace, { ok: sv.askOk.replace }))) return;
    setSecret((await api.newLink(t.id)).secret);
    setCopied(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* the field can still be copied by hand */ }
  };
  return (
    <div className="card">
      <h3>{svAdmin.share.title}</h3>
      <p className="ro note">{svAdmin.share.hint}</p>
      {secret !== undefined && (
        <div className="row mid">{/* the field and its buttons on one row, as for the personal links */}
          {secret ? <input className="linkfield" readOnly value={url} aria-label={svAdmin.share.title} onFocus={(e) => e.currentTarget.select()} />
            : <span className="ro">{svAdmin.share.none}</span>}
          <span className="end">
            {secret && <IconButton icon="qr" look="bare" tip="left" label={svAdmin.qr.show(svAdmin.people.follower)} onClick={() => setShowQr(true)} />}
            {secret && <IconButton icon="copy" look="bare" tip="left" label={svAdmin.share.copy} onClick={copy} />}
            <IconButton icon={secret ? "refresh" : "plus"} look="bare" tip="left" label={secret ? svAdmin.share.replace : svAdmin.share.create} onClick={make} />
          </span>
        </div>
      )}
      {copied && <p className="ro" role="status">{svAdmin.share.copied}</p>}
      {showQr && url && <QrDialog url={url} name={svAdmin.people.follower} close={() => setShowQr(false)} />}
    </div>
  );
}

/** BK-14, DB-21: the trip's inbox address for booking confirmations, or its wish address, to copy or replace; off without a
 * mail domain on the server. */
function Inbox({ t, kind }: { t: Trip; kind: "bookings" | "wishes" }) {
  const [box, setBox] = useState<{ enabled: boolean; address?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const text = kind === "wishes" ? svAdmin.wishInbox : svAdmin.inbox;
  useEffect(() => {
    api.inbox(t.id).then((b) => setBox(kind === "wishes" ? { enabled: b.enabled, ...(t.wishInbox ? { address: t.wishInbox } : {}) } : b), () => setBox({ enabled: false }));
  }, [t.id, kind]); // eslint-disable-line react-hooks/exhaustive-deps -- the address is kept here after a replace
  if (!box) return null;
  const make = async () => {
    if (box.address && !(await ask(text.confirmReplace, { ok: sv.askOk.replace }))) return;
    setBox({ enabled: true, address: (await (kind === "wishes" ? api.newWishInbox(t.id) : api.newInbox(t.id))).address });
    setCopied(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(box.address ?? ""); setCopied(true); } catch { /* the field can still be copied by hand */ } };
  return (
    <div className="card">
      <h3>{text.title}</h3>
      <p className="ro note">{box.enabled ? text.hint : svAdmin.inbox.off}</p>
      {box.enabled && <div className="row mid">
        {box.address ? <input className="linkfield" readOnly value={box.address} aria-label={text.title} onFocus={(e) => e.currentTarget.select()} />
          : <span className="ro">{svAdmin.inbox.none}</span>}
        <span className="end">
          {box.address && <IconButton icon="copy" look="bare" tip="left" label={svAdmin.inbox.copy} onClick={copy} />}
          <IconButton icon={box.address ? "refresh" : "plus"} look="bare" tip="left" label={box.address ? svAdmin.inbox.replace : svAdmin.inbox.create} onClick={make} />
        </span>
      </div>}
      {copied && <p className="ro" role="status">{svAdmin.inbox.copied}</p>}
    </div>
  );
}

/** AU-11: a personal link per traveler, created with the permission Resenär when missing; the permission is picked in a dropdown. */
function PeopleLinks({ t, add }: { t: Trip; add: () => void }) {
  const [links, setLinks] = useState<PersonLinkInfo[] | null>(null);
  const [copied, setCopied] = useState(""), [showQr, setShowQr] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => {
    api.people(t.id).then(async (ls) => {
      const made = await Promise.all(missingLinks(t.travelers, ls).map((id) => api.setPerson(t.id, id, "traveler")));
      setLinks([...ls, ...made]);
    }, () => setLinks([]));
  }, [t.id, t.travelers.map((x) => x.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps -- reload only when travelers change
  const put = (l: PersonLinkInfo) => { setLinks((ls) => [...(ls ?? []).filter((x) => x.travelerId !== l.travelerId), l]); setCopied(""); };
  const [accountErr, setAccountErr] = useState<{ id: string; text: string } | null>(null);
  /** US-21: the address of the traveler's account, saved when the field is left. */
  const saveAccount = async (l: PersonLinkInfo, value: string) => {
    if (value.trim().toLowerCase() === (l.account ?? "")) return;
    try { put(await api.setPerson(t.id, l.travelerId, l.role, value.trim() || null)); setAccountErr(null); }
    catch (x) { setAccountErr({ id: l.travelerId, text: x instanceof ApiError && x.status === 409 ? svAdmin.people.accountTaken : svAdmin.people.accountBad }); }
  };
  const copy = async (l: PersonLinkInfo, name: string) => {
    try { await navigator.clipboard.writeText(personUrl(location.origin, t.id, l.travelerId, l.secret)); setCopied(name); } catch { /* no clipboard */ }
  };
  return (
    <div className="card people">
      <h3>{svAdmin.people.title}</h3>
      <p className="ro note">{svAdmin.people.hint} {svAdmin.people.accountHint}</p>
      {!t.travelers.length && <p className="ro">{svAdmin.people.noTravelers}</p>}
      {links && t.travelers.map((x) => {
        const l = links.find((y) => y.travelerId === x.id);
        return (
          <div className="row mid" key={x.id}>
            <span>{x.name}</span>
            <span className="end">
              {l && <>
                <span className={`rolepick ${l.role}`}>
                  <select aria-label={`${svAdmin.people.role}, ${x.name}`} value={l.role}
                    onChange={async (e) => put(await api.setPerson(t.id, x.id, e.target.value as PersonLinkInfo["role"]))}>
                    {(["traveler", "planner"] as const).map((r) => <option key={r} value={r}>{svAdmin.people.roles[r]}</option>)}
                  </select>
                </span>
                <IconButton icon="qr" look="bare" tip="left" label={svAdmin.qr.show(x.name)}
                  onClick={() => setShowQr({ url: personUrl(location.origin, t.id, l.travelerId, l.secret), name: x.name })} />
                <IconButton icon="copy" look="bare" tip="left" label={svAdmin.people.copy(x.name)} onClick={() => copy(l, x.name)} />
                <IconButton icon="refresh" look="bare" tip="left" label={svAdmin.people.replace(x.name)}
                  onClick={async () => { if (await ask(svAdmin.share.confirmReplace, { ok: sv.askOk.replace })) put(await api.renewPerson(t.id, x.id)); }} />
              </>}
            </span>
            {l && <label className="account"><span className="sr">{svAdmin.people.account(x.name)}</span>
              <input type="email" inputMode="email" autoComplete="off" placeholder={svAdmin.people.accountPlaceholder} defaultValue={l.account ?? ""} key={l.account ?? ""}
                aria-invalid={accountErr?.id === x.id || undefined} onBlur={(e) => saveAccount(l, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} /></label>}
            {accountErr?.id === x.id && <p className="err" role="alert">{accountErr.text}</p>}
          </div>
        );
      })}
      <div className="add"><IconButton icon="plus" label={sv.addPerson} onClick={add} tip="right" /></div> {/* AU-26, UI-09 */}
      {copied && <p className="ro" role="status">{svAdmin.people.copied(copied)}</p>}
      {showQr && <QrDialog url={showQr.url} name={showQr.name} close={() => setShowQr(null)} />}
    </div>
  );
}

/** Who shares an expense shared by all: a toggle button per traveler, pressed by default, off for example for children (MI-38). */
function Sharing({ t, run }: { t: Trip; run: Run }) {
  if (t.travelers.length < 2) return null;
  return (
    <div className="card">
      <h3>{svAdmin.shares.title}</h3>
      <p className="ro note">{svAdmin.shares.hint}</p>
      <div className="sharegrid">{t.travelers.map((x) => ( // six to a row, the name under the button
        <div className="sharer" key={x.id}><span className="verdict">{/* a toggle in the style of the verdict buttons in Minnas: pressed means shares */}
          <IconButton icon="users" tip="up" pressed={x.shares !== false} label={svAdmin.shares.toggle(x.name)}
            onClick={() => run((y) => sharesOps(y, x.id, x.shares === false), "shares")} /></span>
          <span aria-hidden="true">{x.name}</span></div>
      ))}</div>
    </div>
  );
}

const ROLES = ["follower", "traveler", "planner"] as const;
type ARole = (typeof ROLES)[number];
/** AU-20: a matrix with a column per role and the pages as groups: whether each page is visible, and the level of each component
 * on it. Each choice is saved at once, built on the latest trip so a change made meanwhile is kept. */
function Permissions({ t, run }: { t: Trip; run: Run }) {
  const [open, setOpen] = useState<Page[]>([]); // each page folds; closed at first, so the page rows give the overview
  const raw = (r: ARole, pg: Page) => ({ visible: t.access?.[r]?.[pg]?.visible ?? DEFAULT_ACCESS[r][pg].visible, parts: { ...DEFAULT_ACCESS[r][pg].parts, ...t.access?.[r]?.[pg]?.parts } });
  const save = (r: ARole, pg: Page, next: { visible?: boolean; parts?: Record<string, Level> } | null) => run((x) => {
    const { [r]: own = {}, ...others } = x.access ?? {};
    if (!next) return [{ op: "set", path: "access", value: others }]; // back to the defaults for the role
    const cur = own[pg] ?? {};
    return [{ op: "set", path: "access", value: { ...others, [r]: { ...own, [pg]: { ...cur, ...next, parts: { ...cur.parts, ...next.parts } } } } }];
  }, `access ${r} ${pg}`);
  const cell = (label: string, value: string, options: [string, string][], onChange: (v: string) => void) => (
    <span className={`rolepick sm lvl-${value}`}><select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select></span>
  );
  return (
    <div className="card perms">
      <h3>{svAdmin.perms.title}</h3>
      <p className="ro note">{svAdmin.perms.hint}</p>
      <div className="pgrid" role="table" aria-label={svAdmin.perms.title}>
        <div className="prow phead" role="row"><span role="columnheader" />
          {ROLES.map((r) => <span key={r} role="columnheader" className={`who ${r === "follower" ? "follower" : r}`}>{svAdmin.perms.roles[r]}
            {t.access?.[r] && <IconButton icon="refresh" look="bare" tip="left" label={svAdmin.perms.reset(svAdmin.perms.roles[r])} onClick={() => save(r, "up", null)} />}</span>)}
        </div>
        {PAGES.map((pg) => <div key={pg} className="pgroup" role="rowgroup">
          <div className="prow ppage" role="row"><span role="rowheader">
            <button className="pfold" aria-expanded={open.includes(pg)} onClick={() => setOpen((o) => (o.includes(pg) ? o.filter((x) => x !== pg) : [...o, pg]))}>{sv.tabs[pg]}</button></span>
            {ROLES.map((r) => <span key={r} role="cell">{cell(`${svAdmin.perms.page} ${sv.tabs[pg]}, ${svAdmin.perms.roles[r]}`, raw(r, pg).visible ? "shown" : "hidden",
              [["shown", svAdmin.perms.shown], ["hidden", svAdmin.perms.level.hidden]], (v) => save(r, pg, { visible: v === "shown" }))}</span>)}
          </div>
          {open.includes(pg) && Object.keys(PAGE_PARTS[pg]).map((k) => <div key={k} className="prow" role="row"><span role="rowheader">{svAdmin.perms.part[pg][k]!}</span>
            {ROLES.map((r) => <span key={r} role="cell">{raw(r, pg).visible
              ? cell(`${svAdmin.perms.part[pg][k]!} (${sv.tabs[pg]}), ${svAdmin.perms.roles[r]}`, raw(r, pg).parts[k] ?? "hidden", levelsFor(r, pg, k).map((l) => [l, svAdmin.perms.level[l]]),
                (v) => save(r, pg, { parts: { [k]: v as Level } }))
              : <span className="na" title={svAdmin.perms.off}>–</span>}</span>)}
          </div>)}
        </div>)}
      </div>
      <p className="ro note">{svAdmin.perms.fixed}</p>
    </div>
  );
}

/** The trip's settings: only what applies to this trip (MT-13). A Planerare sees them; the AI switch and permissions are for the superuser
 * (AU-14), deleting also for the trip's owner (US-14). */
export function AdminPage({ t, superuser, manager, settings, back, edit, addPerson, change, run, removeTrip, openSettings }: {
  t: Trip; superuser: boolean; manager: boolean; settings?: Settings; back: () => void; edit: (d: EditDlg) => void; addPerson: () => void; run: Run;
  change: (ops: Op[], reason: string) => void; removeTrip: () => void; openSettings: () => void;
}) {
  return <>
    <div className="top"><IconButton icon="back" label={sv.back} onClick={back} tip="right" /></div><h1>{sv.tripSettings}</h1>
    <div className="card"><h3>{sv.tripDetails}</h3><div className="row mid"><span>{sv.name}: {t.title}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editTrip} onClick={() => edit({ kind: "trip" })} /></div>
      <div className="row mid"><span>{sv.tripDates}: {tripRange(t) ? tripDates(t) : sv.noDates}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editDates} onClick={() => edit({ kind: "dates" })} /></div>
      <div className="row mid"><span>{sv.budgetMax}: {t.budgetMax !== undefined ? money(t.budgetMax, t.currency) : sv.noBudgetMax}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editBudgetMax} onClick={() => edit({ kind: "budgetMax" })} /></div>
      <div className="row mid"><span>{sv.minnas.albumLabel}: {t.album ? <a className="place" href={t.album} target="_blank" rel="noopener noreferrer">{new URL(t.album).host}</a> : sv.minnas.noAlbum}</span><IconButton icon="edit" look="bare" tip="left" label={sv.minnas.editAlbum} onClick={() => edit({ kind: "album" })} /></div></div>
    <PeopleLinks t={t} add={addPerson} />
    <Sharing t={t} run={run} />
    {superuser && <Permissions t={t} run={run} />}
    <ShareLink t={t} />
    <Inbox t={t} kind="bookings" />
    <Inbox t={t} kind="wishes" />
    {superuser && settings && <TripAi s={settings} on={t.ai} openSettings={openSettings} onChange={(on) => change([{ op: "set", path: "ai", value: on }], on ? "AI on for trip" : "AI off for trip")} />}
    {manager && <div className="card danger"><h3>{sv.danger}</h3><IconButton icon="trash" look="red" label={sv.deleteTrip} onClick={removeTrip} tip="right" /></div>}
  </>;
}
