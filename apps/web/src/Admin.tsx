// The trip's settings page, the admin login and the share link. Loaded on demand (PF-01).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Op, Settings, Trip } from "@trip/schema";
import { api, ApiError, installed, type PersonLinkInfo } from "./api.ts";
import { customAccess, linkFromText, missingLinks, permSwitches, personUrl, setupUrl, shareUrl, switchAccess, type PermSwitches } from "./access.ts";
import { renameTraveler, tripRange } from "./edit.ts";
import { addedMail, inviteMail, travelerLine, tripDates } from "./format.ts";
import { money } from "./budget.ts";
import { sharesOps } from "./money.ts";
import { AiMark, Icon, IconButton } from "./Icons.tsx";
import { QrDialog } from "./QrDialog.tsx";
import { qr, qrSvgPath } from "./qr.ts";
import { Switch, TripAi } from "./Settings.tsx";
import type { EditDlg } from "./editKinds.ts";
import type { Run } from "./TripView.tsx";
import { sv } from "./sv.ts";
import { rulesText } from "./tripCheck.ts";
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
/** SP-13: Google was right for a superuser, so the second step comes next. Read once and cleared. */
const googleSecond = (() => {
  const h = location.hash;
  if (h !== "#login=kod" && h !== "#login=ny") return undefined;
  history.replaceState(null, "", location.pathname + location.search);
  return h === "#login=kod" ? "code" as const : "enroll" as const;
})();

/** AU-04, AU-07, US-07..US-10, US-19: the login with address and password or Google, also shown when a link is missing or no longer
 * valid. Without an address, the password is the admin password (US-18). A superuser then gives the second step (SP-13). */
export function Login({ expired, onDone }: { expired: boolean; onDone: () => void }) {
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState(googleAnswer), [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false), [reset, setReset] = useState(false);
  const [second, setSecond] = useState(googleSecond);
  useEffect(() => { api.authConfig().then((c) => { setGoogle(c.google); setReset(!!c.reset); }, () => {}); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.login(pw, email);
      if (r?.second) { setSecond(r.second); setPw(""); } else onDone();
    } catch (x) {
      const s = x instanceof ApiError ? x.status : 0;
      setErr(s === 401 ? sv.login.wrong : s === 429 ? sv.login.tooMany : s === 404 ? sv.login.off : s === 403 ? svAdmin.second.accountFirst : sv.error);
    }
    setBusy(false);
  };
  if (second) return <SecondFactor first={second === "enroll"} onDone={onDone} restart={() => { setSecond(undefined); setErr(""); }} />;
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
    <Forgot google={google} reset={reset} email={email} /> {/* US-35 */}
    {installed && <PasteLink />}
    <p className="ro"><a className="place" href="/om.html">{sv.login.about}</a></p> {/* UI-13 */}
  </>;
}

/** SP-13: the superuser's second step: the code from the authenticator app or a recovery code. The first time it is set up: a QR code
 * (drawn here, so the secret never leaves the device), a link that opens the app on a phone, the key to type, then the recovery codes. */
function SecondFactor({ first, onDone, restart }: { first: boolean; onDone: () => void; restart: () => void }) {
  const t = svAdmin.second;
  const [setup, setSetup] = useState<{ secret: string; uri: string }>(), [code, setCode] = useState(""), [byRecovery, setByRecovery] = useState(false);
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [codes, setCodes] = useState<string[]>(), [left, setLeft] = useState<number>(), [copied, setCopied] = useState(false);
  useEffect(() => { if (first) api.loginEnroll().then(setSetup, () => setErr(t.wrong)); }, [first, t]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.loginCode(code);
      if (r?.recovery) setCodes(r.recovery); else if (r?.left !== undefined) setLeft(r.left); else onDone();
    } catch (x) {
      const s = x instanceof ApiError ? x.status : 0;
      setErr(s === 401 ? t.wrong : s === 429 ? sv.login.tooMany : sv.error);
      setCode("");
    }
    setBusy(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(codes!.join("\n")); setCopied(true); } catch { /* the codes stay on screen */ } };
  const top = <div className="top"><div className="logo">{sv.hub}</div></div>;
  if (codes) return <>{top}<h1>{t.savedTitle}</h1>
    <div className="card">
      <p className="ro">{t.savedLead}</p>
      <pre aria-label={t.savedTitle}>{codes.join("\n")}</pre>
      <button type="button" className="btn ghost" onClick={copy}>{t.copy}</button>
      {copied && <p className="ro note" role="status">{t.copied}</p>}
      <button type="button" className="btn" onClick={onDone}>{t.done}</button>
    </div></>;
  if (left !== undefined) return <>{top}<h1>{t.title}</h1>
    <div className="card"><p className="ro" role="status">{t.left(left)}</p><button type="button" className="btn" onClick={onDone} autoFocus>{t.next}</button></div></>;
  const qrPath = setup && qrSvgPath(qr(setup.uri));
  return <>{top}<h1>{first ? t.setupTitle : t.title}</h1>
    <form className="card" onSubmit={submit}>
      {first && <>
        <p className="ro">{t.setupLead}</p>
        {setup && qrPath && <>
          <svg className="qr" viewBox={`0 0 ${qrPath.box} ${qrPath.box}`} role="img" aria-label={t.qr} shapeRendering="crispEdges"><rect width={qrPath.box} height={qrPath.box} className="qrbg" /><path d={qrPath.path} /></svg>
          <p className="ro"><a className="place" href={setup.uri}>{t.openApp}</a></p>
          <p className="ro note">{t.manual} <code>{setup.secret.replace(/(.{4})(?=.)/g, "$1 ")}</code></p>
        </>}
      </>}
      {!first && <p className="ro">{byRecovery ? t.useRecovery : t.ask}</p>}
      <label>{byRecovery ? t.recoveryCode : t.code}
        <input key={String(byRecovery)} inputMode={byRecovery ? "text" : "numeric"} autoComplete={byRecovery ? "off" : "one-time-code"} autoCapitalize="none"
          value={code} onChange={(e) => { setCode(e.target.value); setErr(""); }} autoFocus maxLength={byRecovery ? 16 : 8} />
      </label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" type="submit" disabled={busy || !code.trim() || (first && !setup)}>{first ? t.confirm : t.submit}</button>
      {!first && <p className="ro"><button type="button" className="place" onClick={() => { setByRecovery(!byRecovery); setCode(""); setErr(""); }}>{byRecovery ? t.useCode : t.useRecovery}</button></p>}
      <p className="ro"><button type="button" className="place" onClick={restart}>{t.restart}</button></p>
    </form></>;
}

/** US-35: a forgotten password: a mailed password link when the server has a mail service, else how to get in again: a new link from
 * the one who runs the instance, or Google with the same address. The answer is the same whatever the address. */
function Forgot({ google, reset, email }: { google: boolean; reset: boolean; email: string }) {
  const [open, setOpen] = useState(false), [to, setTo] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const toggle = () => { if (!open) { setTo(email.trim()); setNote(""); } setOpen(!open); };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await api.reset(to); setNote(sv.login.forgotSent(to.trim())); } catch { setNote(sv.login.forgotFailed); }
    setBusy(false);
  };
  const orGoogle = google ? ` ${sv.login.forgotGoogle}` : "";
  return <div className="forgot">
    <button type="button" className="place" aria-expanded={open} onClick={toggle}>{sv.login.forgot}</button>
    {open && !reset && <p className="ro note" role="status">{sv.login.forgotHelp}{orGoogle}</p>}
    {open && reset && <form className="card" onSubmit={send}>
      <p className="ro note">{sv.login.forgotAsk}{orGoogle}</p>
      <label>{sv.login.email}<input type="email" inputMode="email" autoComplete="username" value={to} onChange={(e) => setTo(e.target.value)} autoFocus /></label>
      <button className="btn" type="submit" disabled={busy || !validAddress(to.trim())}>{sv.login.forgotSend}</button>
      {note && <p className="ro note" role="status">{note}</p>}
    </form>}
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
  const [second, setSecond] = useState<"code" | "enroll">(); // SP-13
  useEffect(() => { api.setupInfo(user, secret).then(setWho, () => setWho(null)); }, [user, secret]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ([...pw].length < 10) { setErr(sv.login.setShort); return; }
    setBusy(true);
    try { const r = await api.setup(user, secret, pw, ok); if (r?.second) setSecond(r.second); else onDone(); } catch (x) { setErr(x instanceof ApiError && x.status === 410 ? sv.login.setGone : sv.error); }
    setBusy(false);
  };
  // The link is used up once the password is set; starting over is the login page.
  if (second) return <SecondFactor first={second === "enroll"} onDone={onDone} restart={() => { location.hash = "#login"; location.reload(); }} />;
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

/** AU-40, AU-06, AU-31: the row Följare: everyone with the trip's share link reads it; the button opens the link as a QR code with
 * buttons to copy and replace it. Replacing it stops the old link at once. */
function FollowerRow({ t }: { t: Trip }) {
  const [secret, setSecret] = useState<string | null | undefined>(undefined); // undefined: loading, null: none yet
  const [open, setOpen] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => { api.link(t.id).then((r) => setSecret(r.secret), () => setSecret(null)); }, [t.id]);
  const url = secret ? shareUrl(location.origin, t.id, secret) : "";
  const make = async () => {
    if (secret && !(await ask(svAdmin.share.confirmReplace, { ok: sv.askOk.replace }))) return;
    setSecret((await api.newLink(t.id)).secret);
    setCopied(false);
    setOpen(true);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* no clipboard */ } };
  return <div className="row mid trow">
    <span className="tperson"><span className="rolemark initial follower" role="img" aria-label={svAdmin.people.follower} title={svAdmin.people.follower}><Icon name="eye" /></span>
      <span className="tname"><b>{svAdmin.people.follower}</b><small className="ro">{secret === null ? svAdmin.share.none : svAdmin.share.line}</small></span></span>
    {secret !== undefined && <span className="end">{secret
      ? <IconButton icon="link" look="bare" tip="left" label={svAdmin.share.open} onClick={() => { setCopied(false); setOpen(true); }} />
      : <IconButton icon="plus" look="bare" tip="left" label={svAdmin.share.create} onClick={make} />}</span>}
    {open && url && <QrDialog url={url} name={svAdmin.people.follower} close={() => setOpen(false)}>
      <p className="ro note">{svAdmin.share.hint}</p>
      <div className="row mid sharebar">
        <IconButton icon="copy" tip="right" label={svAdmin.share.copy} onClick={copy} />
        <IconButton icon="refresh" tip="right" label={svAdmin.share.replace} onClick={make} />
      </div>
      {copied && <p className="ro" role="status">{svAdmin.share.copied}</p>}
    </QrDialog>}
  </div>;
}

/** BK-26, AU-39: the trip's one mail address as plain text, made when the settings first show it, to copy or replace; off without a
 * mail domain on the server. */
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
  const copy = async () => { try { await navigator.clipboard.writeText(box.address ?? ""); setCopied(true); } catch { /* the address can still be selected */ } };
  return (
    <div className="card inbox">
      <h3>{svAdmin.inbox.title}</h3>
      <p className="ro note">{box.enabled ? svAdmin.inbox.hint : svAdmin.inbox.off}</p>
      {box.enabled && box.address && <div className="row mid">
        <span className="addr">{box.address}</span>
        <span className="end">
          <IconButton icon="copy" look="bare" tip="left" label={svAdmin.inbox.copy} onClick={copy} />
          <IconButton icon="refresh" look="bare" tip="left" label={svAdmin.inbox.replace} onClick={replace} />
        </span>
      </div>}
      {copied && <p className="ro" role="status">{svAdmin.inbox.copied}</p>}
    </div>
  );
}

type Login = NonNullable<PersonLinkInfo["login"]>;
/** AU-40: everyone who takes part in one card: a row per traveler with the permission's colour, a line with the permission, the login
 * status (US-36) and whether they share costs, and a mail button that opens the dialog at the address (US-30); then the row Följare
 * and the add button. A link with the permission Resenär is made for each traveler who has none (AU-11). */
function Travelers({ t, add, run }: { t: Trip; add: (id?: string) => void; run: Run }) {
  const [links, setLinks] = useState<PersonLinkInfo[] | null>(null);
  const [open, setOpen] = useState<string | null>(null), [sharing, setSharing] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false); // opened from the row's mail button: straight to the address (US-30)
  useEffect(() => {
    api.people(t.id).then(async (ls) => {
      const made = await Promise.all(missingLinks(t.travelers, ls).map((id) => api.setPerson(t.id, id, "traveler")));
      setLinks([...ls, ...made]);
    }, () => setLinks([]));
  }, [t.id, t.travelers.map((x) => x.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps -- reload only when travelers change
  const put = (l: PersonLinkInfo) => setLinks((ls) => [...(ls ?? []).filter((x) => x.travelerId !== l.travelerId), l]);
  const mark = (id: string, login: Login) => setLinks((ls) => (ls ?? []).map((x) => (x.travelerId === id ? { ...x, login } : x)));
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
              <span className="tname"><b>{x.name}</b><small className={`ro login-${l?.login ?? "none"}`}>{travelerLine(role, x.shares !== false, l?.login)}</small></span>
            </button>
            {l && <span className="end"><IconButton icon="mail" look="bare" tip="left" label={svAdmin.people.invite(x.name)} onClick={() => { setInviting(true); setOpen(x.id); }} /></span>} {/* US-30 */}
          </div>
        );
      })}
      <FollowerRow t={t} />
      <div className="add"><IconButton icon="plus" label={sv.addPerson} onClick={() => add()} tip="right" /> {/* never the click as an id */}</div> {/* AU-26, UI-09 */}
      {who && linkOf(who.id) && <TravelerDialog t={t} x={who} link={linkOf(who.id)!} put={put} mark={(login) => mark(who.id, login)} share={() => setSharing(who.id)} run={run} invite={inviting}
        close={() => { setOpen(null); setInviting(false); }} />}
      {shared && linkOf(shared.id) && <ShareDialog t={t} name={shared.name} link={linkOf(shared.id)!} put={put} close={() => setSharing(null)} />}
    </div>
  );
}

/** AU-40, AU-31: a personal link as a QR code, with buttons to copy it and to make a new one that replaces it at once (AU-11). */
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

/** AU-40: a traveler's name (AU-32), permission (AU-11) and Delar på kostnader (MI-38), then Inloggning: the status (US-36), the
 * account address (US-21) with Bjud in beside it (US-30) and the personal link for those without an account; saved together. */
function TravelerDialog({ t, x, link, put, mark, share, run, invite, close }: { t: Trip; x: Trip["travelers"][number]; link: PersonLinkInfo;
  put: (l: PersonLinkInfo) => void; mark: (login: Login) => void; share: () => void; run: Run; invite?: boolean; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), mailField = useRef<HTMLInputElement>(null);
  useEffect(() => { if (invite) requestAnimationFrame(() => { mailField.current?.scrollIntoView({ block: "center" }); mailField.current?.focus(); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when opened for an invitation (US-30)
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
        <fieldset className="tlogin"><legend>{svAdmin.people.login}</legend>
          <p className={`ro login-${link.login ?? "none"}`} role="status">{sv.people.login[link.login ?? "none"]}</p>
          <Invite t={t} x={x} to={account.trim().toLowerCase()} mark={mark} ready={async () => { // US-30: a typed address is saved first
            const to = account.trim().toLowerCase();
            if (!validAddress(to)) { setErr(svAdmin.people.accountBad); return false; }
            if (to === link.account) return true;
            try { put(await api.setPerson(t.id, x.id, role, to)); setErr(""); return true; }
            catch (y) { setErr(y instanceof ApiError && y.status === 409 ? svAdmin.people.accountTaken : svAdmin.people.accountBad); return false; }
          }}>
            <input ref={mailField} type="email" inputMode="email" autoComplete="off" aria-label={svAdmin.people.account} placeholder={svAdmin.people.accountPlaceholder} value={account} onChange={(e) => setAccount(e.target.value)} />
          </Invite>
          <p className="ro note">{svAdmin.people.accountHint}</p>
          {link.login !== "active" && <div className="row mid"><small className="ro">{svAdmin.people.noAccount}</small>
            <span className="end"><IconButton icon="link" look="bare" tip="left" label={svAdmin.people.share(x.name)} onClick={share} /></span></div>} {/* AU-11 */}
        </fieldset>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="dlgbar"><button className="btn" type="submit" disabled={busy}>{sv.save}</button></div>
      </form>
    </dialog>
  );
}

const until = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
const validAddress = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
/** US-30, US-31, US-37: the address field with Bjud in beside it: an account and a password link to mail, copy or show, also anew for
 * an account that never logged in; for an account that can already log in, the login page to mail, copy or show; a disabled one is said. */
type Sent = { kind: "setup"; url: string; until: string } | { kind: "added"; url: string } | { kind: "disabled" };
function Invite({ t, x, to, ready, mark, children }: { t: Trip; x: Trip["travelers"][number]; to: string; ready: () => Promise<boolean>; mark: (login: Login) => void; children: ReactNode }) {
  const [sent, setSent] = useState<Sent | null>(null), [note, setNote] = useState(""), [qr, setQr] = useState(false), [copied, setCopied] = useState(false);
  const go = async () => {
    if (!(await ready())) return;
    setNote(""); setCopied(false);
    try {
      const r = await api.invite(t.id, x.id);
      if ("setup" in r) { setSent({ kind: "setup", url: setupUrl(location.origin, r.user, r.setup.secret), until: until(r.setup.expires) }); mark("invited"); }
      else setSent(r.disabled ? { kind: "disabled" } : { kind: "added", url: `${location.origin}/#login` }); // the status came with the saved address (US-36)
    } catch { setSent(null); setNote(svAdmin.people.inviteFailed); }
  };
  const url = sent && sent.kind !== "disabled" ? sent.url : "";
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* no clipboard */ } };
  const [mailHref, mailLabel, copyLabel] = sent?.kind === "setup"
    ? [inviteMail({ to, name: x.name, trip: t.title, url, until: sent.until }), svAdmin.people.mail(x.name), svAdmin.people.copyInvite(x.name)]
    : [addedMail({ to, name: x.name, trip: t.title, url }), svAdmin.people.mailAdded(x.name), svAdmin.people.copyLogin];
  return <div className="invite">
    <div className="row mid">{children}<IconButton icon="mail" tip="left" label={svAdmin.people.invite(x.name)} disabled={!to} onClick={() => go()} /></div>
    {sent?.kind === "disabled" && <p className="ro" role="status">{svAdmin.people.disabled(x.name)}</p>}
    {url && <div className="setuplink" role="status">
      <p>{sent?.kind === "setup" ? svAdmin.people.invited(x.name, sent.until) : svAdmin.people.hasAccount(x.name)}</p>
      <span className="end">
        <a className="btn ghost icon bare tip-left" href={mailHref} aria-label={mailLabel} data-tip={mailLabel}><Icon name="mail" /></a>
        <IconButton icon="copy" look="bare" tip="left" label={copyLabel} onClick={copy} />
        <IconButton icon="qr" look="bare" tip="left" label={svAdmin.qr.show(x.name)} onClick={() => setQr(true)} />
      </span>
      {copied && <p className="ro">{svAdmin.people.copied2}</p>}
    </div>}
    {note && <p className="ro" role="status">{note}</p>}
    {qr && url && <QrDialog url={url} name={x.name} close={() => setQr(false)} />}
  </div>;
}

/** The role icons of US-40 for the permission toggle. */
const ROLE_ICON = { traveler: "luggage", planner: "compass" } as const;
/** AU-41: the permissions as three switches, each saved at once on the latest trip; a trip with permissions the switches cannot give
 * says so until a switch is changed. */
function Permissions({ t, run }: { t: Trip; run: Run }) {
  const s = permSwitches(t);
  const flip = (k: keyof PermSwitches, on: boolean) => run((y) => [{ op: "set", path: "access", value: switchAccess({ ...permSwitches(y), [k]: on }) }], `access ${k}`);
  return (
    <div className="card perms">
      <h3>{svAdmin.perms.title}</h3>
      <p className="ro note">{svAdmin.perms.fixed}</p>
      {(Object.keys(svAdmin.perms.switches) as (keyof PermSwitches)[]).map((k) =>
        <Switch key={k} id={`perm-${k}`} label={svAdmin.perms.switches[k][0]} tip={svAdmin.perms.switches[k][1]} checked={s[k]} onChange={(on) => flip(k, on)} />)}
      {customAccess(t) && <p className="ro note" role="status">{svAdmin.perms.custom}</p>}
    </div>
  );
}

/** AU-39: one row of the card Resan, a small label above the value and an edit button. */
const Detail = ({ label, value, edit, editLabel }: { label: string; value: ReactNode; edit: () => void; editLabel: string }) =>
  <div className="row mid kv"><span><small className="ro">{label}</small><span>{value}</span></span>
    <IconButton icon="edit" look="bare" tip="left" label={editLabel} onClick={edit} /></div>;

/** AU-39: the trip's settings, only what applies to this trip (MT-13). A Planerare sees them; the AI switch is for the superuser
 * (AU-14), deleting also for the trip's owner (US-14). */
export function AdminPage({ t, superuser, manager, back, edit, addPerson, change, reload, run, removeTrip, openSettings }: {
  t: Trip; superuser: boolean; manager: boolean; back: () => void; edit: (d: EditDlg) => void; addPerson: () => void; run: Run;
  change: (ops: Op[], reason: string) => void | Promise<unknown>; reload: () => void | Promise<unknown>; removeTrip: () => void; openSettings: () => void;
}) {
  return <>
    <div className="top"><IconButton icon="back" label={sv.back} onClick={back} tip="right" /></div><h1>{sv.tripSettings}</h1>
    <div className="card"><h3>{sv.tripDetails}</h3>
      <Detail label={sv.name} value={t.title} editLabel={sv.editTrip} edit={() => edit({ kind: "trip" })} />
      <Detail label={sv.tripDates} value={tripRange(t) ? tripDates(t) : sv.noDates} editLabel={sv.editDates} edit={() => edit({ kind: "dates" })} />
      <Detail label={sv.budgetMax} value={t.budgetMax !== undefined ? money(t.budgetMax, t.currency) : sv.noBudgetMax} editLabel={sv.editBudgetMax} edit={() => edit({ kind: "budgetMax" })} />
      <Detail label={sv.check.rules} value={<>{t.rules?.ai && <AiMark label={sv.check.fromAi} />}{rulesText(t)}</>} editLabel={sv.check.editRules} edit={() => edit({ kind: "rules" })} /> {/* DM-15 */}
      <Detail label={sv.minnas.albumLabel} value={t.album ? <a className="place" href={t.album} target="_blank" rel="noopener noreferrer">{new URL(t.album).host}</a> : sv.minnas.noAlbum}
        editLabel={sv.minnas.editAlbum} edit={() => edit({ kind: "album" })} /></div>
    <Travelers t={t} add={addPerson} run={run} />
    <Permissions t={t} run={run} />
    <Inbox t={t} />
    {manager && <TripAi t={t} superuser={superuser} change={change} reload={reload} openSettings={openSettings} />}
    {manager && <div className="card dangerrow row mid"><span>{sv.deleteTrip}</span><IconButton icon="trash" look="red" label={sv.deleteTrip} onClick={removeTrip} tip="left" /></div>}
  </>;
}
