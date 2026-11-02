// The trip's settings page, the admin login and the share link. Loaded on demand (PF-01).
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Op, Settings, Trip } from "@trip/schema";
import { api, ApiError, installed, type PersonLinkInfo, type SetupLink } from "./api.ts";
import { LEVEL_ICON, linkFromText, missingLinks, nextLevel, PERM_ROLES, personUrl, setupUrl, shareUrl } from "./access.ts";
import { CONTENT, contentLevels, DEFAULT_CONTENT, DEFAULT_TABS, ownAccess, PAGES, type Level, type RoleAccess } from "@trip/schema/src/rules.ts";
import { renameTraveler, tripRange } from "./edit.ts";
import { inviteMail, travelerLine, tripDates } from "./format.ts";
import { money } from "./budget.ts";
import { sharesOps } from "./money.ts";
import { Icon, IconButton } from "./Icons.tsx";
import { QrDialog } from "./QrDialog.tsx";
import { TripAi } from "./Settings.tsx";
import type { EditDlg } from "./editKinds.ts";
import type { Run } from "./TripView.tsx";
import { sv } from "./sv.ts";
import { ask } from "./Ask.tsx"; // UI-11
import { svAdmin } from "./sv-admin.ts";
import { onOutside } from "./outside.ts";

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
    <Forgot google={google} /> {/* US-33 */}
    {installed && <PasteLink />}
    <p className="ro"><a className="place" href="/om.html">{sv.login.about}</a></p> {/* UI-13 */}
  </>;
}

/** US-33: how to get in again without a password: the inviter makes a new link, or Google with the same address. */
function Forgot({ google }: { google: boolean }) {
  const [open, setOpen] = useState(false);
  return <div className="forgot">
    <button type="button" className="place" aria-expanded={open} onClick={() => setOpen(!open)}>{sv.login.forgot}</button>
    {open && <p className="ro note" role="status">{sv.login.forgotHelp}{google ? ` ${sv.login.forgotGoogle}` : ""}</p>}
  </div>;
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

/** BK-26: the trip's one mail address, made when the settings first show it, to copy or replace; off without a mail domain on the server. */
function Inbox({ t }: { t: Trip }) {
  const [box, setBox] = useState<{ enabled: boolean; address?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api.inbox(t.id).then(async (b) => setBox(b.enabled && !b.address ? { enabled: true, address: (await api.openInbox(t.id)).address } : b), () => setBox({ enabled: false }));
  }, [t.id]);
  if (!box) return null;
  const replace = async () => {
    if (!(await ask(svAdmin.inbox.confirmReplace, { ok: sv.askOk.replace }))) return;
    setBox({ enabled: true, address: (await api.replaceInbox(t.id)).address });
    setCopied(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(box.address ?? ""); setCopied(true); } catch { /* the field can still be copied by hand */ } };
  return (
    <div className="card">
      <h3>{svAdmin.inbox.title}</h3>
      <p className="ro note">{box.enabled ? svAdmin.inbox.hint : svAdmin.inbox.off}</p>
      {box.enabled && box.address && <div className="row mid">
        <input className="linkfield" readOnly value={box.address} aria-label={svAdmin.inbox.title} onFocus={(e) => e.currentTarget.select()} />
        <span className="end">
          <IconButton icon="copy" look="bare" tip="left" label={svAdmin.inbox.copy} onClick={copy} />
          <IconButton icon="refresh" look="bare" tip="left" label={svAdmin.inbox.replace} onClick={replace} />
        </span>
      </div>}
      {copied && <p className="ro" role="status">{svAdmin.inbox.copied}</p>}
    </div>
  );
}

/** AU-38: the travelers in one calm card: a row each with the permission's colour and a line on how they take part, a button that
 * shares the personal link (AU-11, AU-31), and the row opens the traveler's dialog. A link with the permission Resenär is made
 * for each traveler who has none. */
function Travelers({ t, add, run }: { t: Trip; add: (id?: string) => void; run: Run }) {
  const [links, setLinks] = useState<PersonLinkInfo[] | null>(null);
  const [open, setOpen] = useState<string | null>(null), [sharing, setSharing] = useState<string | null>(null);
  useEffect(() => {
    api.people(t.id).then(async (ls) => {
      const made = await Promise.all(missingLinks(t.travelers, ls).map((id) => api.setPerson(t.id, id, "traveler")));
      setLinks([...ls, ...made]);
    }, () => setLinks([]));
  }, [t.id, t.travelers.map((x) => x.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps -- reload only when travelers change
  const put = (l: PersonLinkInfo) => setLinks((ls) => [...(ls ?? []).filter((x) => x.travelerId !== l.travelerId), l]);
  const linkOf = (id: string) => links?.find((y) => y.travelerId === id);
  const who = t.travelers.find((x) => x.id === open), shared = t.travelers.find((x) => x.id === sharing);
  return (
    <div className="card people">
      <h3>{svAdmin.people.title}</h3>
      <p className="ro note">{svAdmin.people.hint}</p>
      {!t.travelers.length && <p className="ro">{svAdmin.people.noTravelers}</p>}
      {links && t.travelers.map((x) => {
        const l = linkOf(x.id), role = l?.role ?? "traveler";
        return (
          <div className="row mid trow" key={x.id}>
            <button type="button" className="tperson" onClick={() => setOpen(x.id)} aria-label={svAdmin.people.open(x.name)}>
              <span className={`rolemark initial ${role}`} role="img" aria-label={svAdmin.people.roles[role]} title={svAdmin.people.roles[role]}>{x.name.slice(0, 1).toUpperCase()}</span>
              <span className="tname"><b>{x.name}</b><small className="ro">{travelerLine(role, x.shares !== false)}</small></span>
            </button>
            {l && <span className="end"><IconButton icon="link" look="bare" tip="left" label={svAdmin.people.share(x.name)} onClick={() => setSharing(x.id)} /></span>}
          </div>
        );
      })}
      <div className="add"><IconButton icon="plus" label={sv.addPerson} onClick={add} tip="right" /></div> {/* AU-26, UI-09 */}
      {shared && linkOf(shared.id) && <ShareDialog t={t} name={shared.name} link={linkOf(shared.id)!} put={put} close={() => setSharing(null)} />}
      {who && linkOf(who.id) && <TravelerDialog t={t} x={who} link={linkOf(who.id)!} put={put} run={run} close={() => setOpen(null)} />}
    </div>
  );
}

/** AU-38, AU-31: a personal link as a QR code, with buttons to copy it and to make a new one that replaces it at once (AU-11). */
function ShareDialog({ t, name, link, put, close }: { t: Trip; name: string; link: PersonLinkInfo; put: (l: PersonLinkInfo) => void; close: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = personUrl(location.origin, t.id, link.travelerId, link.secret);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* no clipboard */ } };
  return <QrDialog url={url} name={name} close={close}>
    <div className="row mid sharebar">
      <IconButton icon="copy" tip="right" label={svAdmin.people.copy(name)} onClick={copy} />
      <IconButton icon="refresh" tip="right" label={svAdmin.people.replace(name)}
        onClick={async () => { if (await ask(svAdmin.share.confirmReplace, { ok: sv.askOk.replace })) { put(await api.renewPerson(t.id, link.travelerId)); setCopied(false); } }} />
    </div>
    {copied && <p className="ro" role="status">{svAdmin.people.copied(name)}</p>}
  </QrDialog>;
}

/** AU-38: a traveler's name (AU-32), permission (AU-11), Delar på kostnader (MI-38) and account (US-21), saved together. */
function TravelerDialog({ t, x, link, put, run, close }: { t: Trip; x: Trip["travelers"][number]; link: PersonLinkInfo; put: (l: PersonLinkInfo) => void; run: Run; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(x.name), [role, setRole] = useState(link.role), [shares, setShares] = useState(x.shares !== false);
  const [account, setAccount] = useState(link.account ?? ""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    document.body.style.overflow = "hidden"; // PL-14
    return () => { document.body.style.overflow = ""; opener?.focus(); };
  }, []);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const renamed = renameTraveler(t, x.id, name);
    if (!renamed.ok) { setErr(renamed.error); return; }
    setBusy(true);
    try {
      if (role !== link.role || account.trim().toLowerCase() !== (link.account ?? "")) put(await api.setPerson(t.id, x.id, role, account.trim() || null));
    } catch (y) {
      setErr(y instanceof ApiError && y.status === 409 ? svAdmin.people.accountTaken : svAdmin.people.accountBad); setBusy(false); return;
    }
    if (renamed.ops.length || shares !== (x.shares !== false))
      run((y) => { const r = renameTraveler(y, x.id, name); return [...(r.ok ? r.ops : []), ...sharesOps(y, x.id, shares)]; }, "traveler");
    close();
  };
  return (
    <dialog ref={ref} aria-label={svAdmin.people.edit(x.name)} onClose={close}
      onClick={onOutside(close)}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} /></span>
      <form onSubmit={save}>
        <h3>{svAdmin.people.edit(x.name)}</h3>
        <label>{sv.name}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <fieldset className="trole"><legend>{svAdmin.people.role}</legend>
          <span className="roletoggle" role="group" aria-label={svAdmin.people.role}>
            {(["traveler", "planner"] as const).map((r) => <span key={r} className={`rt ${r}`}>
              <IconButton icon={ROLE_ICON[r]} look="bare" tip="up" pressed={role === r} label={svAdmin.people.roles[r]} onClick={() => setRole(r)} /></span>)}
          </span>
          <span className="rolename">{svAdmin.people.roles[role]}</span>
          <p className="ro note">{svAdmin.people.roleHint}</p>
        </fieldset>
        <label className="check switch"><input type="checkbox" role="switch" checked={shares} onChange={(e) => setShares(e.target.checked)} />{svAdmin.people.shares}</label>
        <p className="ro note">{svAdmin.people.sharesHint}</p>
        <label>{svAdmin.people.account}<input type="email" inputMode="email" autoComplete="off" placeholder={svAdmin.people.accountPlaceholder} value={account} onChange={(e) => setAccount(e.target.value)} /></label>
        <p className="ro note">{svAdmin.people.accountHint}</p>
        {link.account && account.trim().toLowerCase() === link.account && <Invite t={t} x={x} to={link.account} />}
        {err && <p className="err" role="alert">{err}</p>}
        <div className="dlgbar"><button className="btn" type="submit" disabled={busy}>{sv.save}</button></div>
      </form>
    </dialog>
  );
}

const until = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
/** US-30..US-32: the invitation of a traveler with an address: an account and a password link to mail, copy or show, or a new
 * link for an account one invited, after asking. */
function Invite({ t, x, to }: { t: Trip; x: Trip["travelers"][number]; to: string }) {
  const [got, setGot] = useState<{ user: string; setup: SetupLink } | null>(null), [note, setNote] = useState(""), [qr, setQr] = useState(false), [copied, setCopied] = useState(false);
  const go = async (renew = false) => {
    try {
      const r = await api.invite(t.id, x.id, renew);
      if ("setup" in r) { setGot(r); setNote(""); setCopied(false); return; }
      if (r.mayRenew && await ask(svAdmin.people.askRenew(x.name), { ok: sv.askOk.replace })) return go(true);
      setNote(svAdmin.people.hasAccount(x.name));
    } catch { setNote(svAdmin.people.inviteFailed); }
  };
  const url = got && setupUrl(location.origin, got.user, got.setup.secret);
  const copy = async () => { try { await navigator.clipboard.writeText(url!); setCopied(true); } catch { /* no clipboard */ } };
  return <div className="invite">
    <div className="row mid"><IconButton icon="mail" tip="right" label={svAdmin.people.invite(x.name)} onClick={() => go()} /><small className="ro">{svAdmin.people.inviteHint}</small></div>
    {got && url && <div className="setuplink" role="status">
      <p>{svAdmin.people.invited(x.name, until(got.setup.expires))}</p>
      <span className="end">
        <a className="btn ghost icon bare tip-left" href={inviteMail({ to, name: x.name, trip: t.title, url, until: until(got.setup.expires) })} aria-label={svAdmin.people.mail(x.name)} data-tip={svAdmin.people.mail(x.name)}><Icon name="mail" /></a>
        <IconButton icon="copy" look="bare" tip="left" label={svAdmin.people.copyInvite(x.name)} onClick={copy} />
        <IconButton icon="qr" look="bare" tip="left" label={svAdmin.qr.show(x.name)} onClick={() => setQr(true)} />
      </span>
      {copied && <p className="ro">{svAdmin.people.copied2}</p>}
    </div>}
    {note && <p className="ro" role="status">{note}</p>}
    {qr && url && <QrDialog url={url} name={x.name} close={() => setQr(false)} />}
  </div>;
}

const ROLES = PERM_ROLES; // AU-37: Resenär, then Följare
/** The role icons of US-23, with an eye for Följare and the crown for the superuser (AU-37). */
const ROLE_ICON = { follower: "eye", traveler: "luggage", planner: "compass", admin: "crown" } as const;
type ARole = (typeof ROLES)[number];
/** AU-36, AU-37: which tabs Resenär and Följare see, and the level of each kind of content wherever it is shown. Each choice is saved
 * at once, built on the latest trip so a change made meanwhile is kept. */
function Permissions({ t, run }: { t: Trip; run: Run }) {
  const tabs = (r: ARole) => ({ ...DEFAULT_TABS(r), ...ownAccess(t, r).tabs });
  const content = (r: ARole) => ({ ...DEFAULT_CONTENT(r), ...ownAccess(t, r).content });
  const save = (r: ARole, next: RoleAccess | null) => run((x) => {
    const all = Object.fromEntries(ROLES.map((y) => [y, ownAccess(x, y)])) as Record<ARole, RoleAccess>, own = all[r];
    const value = { ...all, [r]: next ? { tabs: { ...own.tabs, ...next.tabs }, content: { ...own.content, ...next.content } } : {} };
    return [{ op: "set", path: "access", value: Object.fromEntries(Object.entries(value).filter(([, v]) => Object.keys(v).length)) }];
  }, `access ${r}`);
  /** AU-37: one button per cell that steps through the levels the cell allows, its icon and colour following the level. */
  const cell = (part: string, r: ARole, value: string, options: [string, string][], onChange: (v: string) => void) => options.length < 2
    ? <span className="na" title={options[0]?.[1]}>–</span>
    : <span className={`lvlcell lvl-${value}`}><IconButton icon={LEVEL_ICON[value as keyof typeof LEVEL_ICON] ?? "eyeoff"} look="bare" tip="left"
      label={svAdmin.perms.cell(part, svAdmin.perms.roles[r], options.find(([v]) => v === value)?.[1] ?? value)}
      onClick={() => onChange(nextLevel(options.map(([v]) => v), value))} /></span>;
  const changed = (r: ARole) => Object.keys(ownAccess(t, r)).length > 0;
  return (
    <div className="card perms">
      <h3>{svAdmin.perms.title}</h3>
      <p className="ro note">{svAdmin.perms.hint}</p>
      <p className="ro note plegend">{(["write", "add", "check", "read", "hidden"] as const).map((l) => /* the level icons */
        <span key={l}><span className={`lvlcell lvl-${l}`} aria-hidden="true"><Icon name={LEVEL_ICON[l]} /></span>{svAdmin.perms.level[l]}</span>)}</p>
      <div className="pgrid" role="table" aria-label={svAdmin.perms.title}>
        <div className="prow phead" role="row"><span role="columnheader" />
          {ROLES.map((r) => <span key={r} role="columnheader" className={`who ${r}`}><span className={`rolemark ${r}`} role="img" aria-label={svAdmin.perms.roles[r]} title={svAdmin.perms.roles[r]}><Icon name={ROLE_ICON[r]} /></span>
            <small>{svAdmin.perms.legend[r]}</small>
            {changed(r) && <IconButton icon="refresh" look="bare" tip="left" label={svAdmin.perms.reset(svAdmin.perms.roles[r])} onClick={() => save(r, null)} />}</span>)}
        </div>
        <div className="prow psec" role="row"><span role="rowheader">{svAdmin.perms.tabs}</span></div>
        {PAGES.map((pg) => <div key={pg} className="prow" role="row"><span role="rowheader">{sv.tabs[pg]}</span>
          {ROLES.map((r) => <span key={r} role="cell">{cell(`${svAdmin.perms.tab} ${sv.tabs[pg]}`, r, tabs(r)[pg] ? "shown" : "hidden",
            [["shown", svAdmin.perms.shown], ["hidden", svAdmin.perms.level.hidden]], (v) => save(r, { tabs: { [pg]: v === "shown" } }))}</span>)}
        </div>)}
        <div className="prow psec" role="row"><span role="rowheader">{svAdmin.perms.contents}</span></div>
        {CONTENT.map((c) => <div key={c} className="prow" role="row"><span role="rowheader">{svAdmin.perms.content[c]}
          {svAdmin.perms.contentHint[c] && <small className="ro">{svAdmin.perms.contentHint[c]}</small>}</span>
          {ROLES.map((r) => <span key={r} role="cell">{cell(svAdmin.perms.content[c], r, content(r)[c],
            contentLevels(r, c).map((l) => [l, svAdmin.perms.level[l as Exclude<Level, never>]]), (v) => save(r, { content: { [c]: v as Level } }))}</span>)}
        </div>)}
      </div>
      <p className="ro note">{svAdmin.perms.fixed}</p>
    </div>
  );
}

/** The trip's settings: only what applies to this trip (MT-13). A Planerare sees them; the AI switch and permissions are for the superuser
 * (AU-14), deleting also for the trip's owner (US-14). */
export function AdminPage({ t, superuser, manager, back, edit, addPerson, change, reload, run, removeTrip, openSettings }: {
  t: Trip; superuser: boolean; manager: boolean; back: () => void; edit: (d: EditDlg) => void; addPerson: () => void; run: Run;
  change: (ops: Op[], reason: string) => void | Promise<unknown>; reload: () => void | Promise<unknown>; removeTrip: () => void; openSettings: () => void;
}) {
  return <>
    <div className="top"><IconButton icon="back" label={sv.back} onClick={back} tip="right" /></div><h1>{sv.tripSettings}</h1>
    <div className="card"><h3>{sv.tripDetails}</h3><div className="row mid"><span>{sv.name}: {t.title}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editTrip} onClick={() => edit({ kind: "trip" })} /></div>
      <div className="row mid"><span>{sv.tripDates}: {tripRange(t) ? tripDates(t) : sv.noDates}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editDates} onClick={() => edit({ kind: "dates" })} /></div>
      <div className="row mid"><span>{sv.budgetMax}: {t.budgetMax !== undefined ? money(t.budgetMax, t.currency) : sv.noBudgetMax}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editBudgetMax} onClick={() => edit({ kind: "budgetMax" })} /></div>
      <div className="row mid"><span>{sv.minnas.albumLabel}: {t.album ? <a className="place" href={t.album} target="_blank" rel="noopener noreferrer">{new URL(t.album).host}</a> : sv.minnas.noAlbum}</span><IconButton icon="edit" look="bare" tip="left" label={sv.minnas.editAlbum} onClick={() => edit({ kind: "album" })} /></div></div>
    <Travelers t={t} add={addPerson} run={run} />
    {superuser && <Permissions t={t} run={run} />}
    <ShareLink t={t} />
    <Inbox t={t} />
    {manager && <TripAi t={t} superuser={superuser} change={change} reload={reload} openSettings={openSettings} />}
    {manager && <div className="card danger"><h3>{sv.danger}</h3><IconButton icon="trash" look="red" label={sv.deleteTrip} onClick={removeTrip} tip="right" /></div>}
  </>;
}
