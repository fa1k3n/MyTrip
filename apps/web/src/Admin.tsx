// The trip's settings page, the admin login and the share link. Loaded on demand (PF-01).
import { useEffect, useState, type FormEvent } from "react";
import type { Op, Settings, Trip } from "@trip/schema";
import { api, ApiError, maskedToken, type PersonLinkInfo } from "./api.ts";
import { missingLinks, personUrl, shareUrl } from "./access.ts";
import { DEFAULT_ACCESS, levelsFor, PAGE_PARTS, PAGES, type Level, type Page } from "@trip/schema/src/rules.ts";
import { tripRange } from "./edit.ts";
import { tripDates } from "./format.ts";
import { money } from "./budget.ts";
import { IconButton } from "./Icons.tsx";
import { TripAi } from "./Settings.tsx";
import type { EditDlg } from "./editKinds.ts";
import type { Run } from "./TripView.tsx";
import { sv } from "./sv.ts";
import { svAdmin } from "./sv-admin.ts";

/** AU-04, AU-05, AU-07: the admin login, also shown when a link is missing or no longer valid. */
export function Login({ expired, onDone }: { expired: boolean; onDone: () => void }) {
  const [pw, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.login(pw);
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
      <label>{sv.login.password}<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" type="submit" disabled={busy || !pw}>{sv.login.submit}</button>
    </form>
  </>;
}

/** AU-06: the trip's share link, to copy or replace. Replacing it stops the old link at once. */
function ShareLink({ t }: { t: Trip }) {
  const [secret, setSecret] = useState<string | null | undefined>(undefined); // undefined: loading, null: none yet
  const [copied, setCopied] = useState(false);
  useEffect(() => { api.link(t.id).then((r) => setSecret(r.secret), () => setSecret(null)); }, [t.id]);
  const url = secret ? shareUrl(location.origin, t.id, secret) : "";
  const make = async () => {
    if (secret && !confirm(svAdmin.share.confirmReplace)) return;
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
      {secret && <input readOnly value={url} aria-label={svAdmin.share.title} onFocus={(e) => e.currentTarget.select()} />}
      {secret !== undefined && (
        <div className="row mid">
          <span className="ro">{copied ? svAdmin.share.copied : secret ? "" : svAdmin.share.none}</span>
          <span className="end">
            {secret && <IconButton icon="copy" look="bare" tip="left" label={svAdmin.share.copy} onClick={copy} />}
            <IconButton icon={secret ? "refresh" : "plus"} look="bare" tip="left" label={secret ? svAdmin.share.replace : svAdmin.share.create} onClick={make} />
          </span>
        </div>
      )}
    </div>
  );
}

/** AU-11: a personal link per traveler, created with the permission Resenär when missing; the permission is picked in a dropdown. */
function PeopleLinks({ t, add }: { t: Trip; add: () => void }) {
  const [links, setLinks] = useState<PersonLinkInfo[] | null>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    api.people(t.id).then(async (ls) => {
      const made = await Promise.all(missingLinks(t.travelers, ls).map((id) => api.setPerson(t.id, id, "traveler")));
      setLinks([...ls, ...made]);
    }, () => setLinks([]));
  }, [t.id, t.travelers.map((x) => x.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps -- reload only when travelers change
  const put = (l: PersonLinkInfo) => { setLinks((ls) => [...(ls ?? []).filter((x) => x.travelerId !== l.travelerId), l]); setCopied(""); };
  const copy = async (l: PersonLinkInfo, name: string) => {
    try { await navigator.clipboard.writeText(personUrl(location.origin, t.id, l.travelerId, l.secret)); setCopied(name); } catch { /* no clipboard */ }
  };
  return (
    <div className="card">
      <h3>{svAdmin.people.title}</h3>
      <p className="ro note">{svAdmin.people.hint}</p>
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
                <IconButton icon="copy" look="bare" tip="left" label={svAdmin.people.copy(x.name)} onClick={() => copy(l, x.name)} />
                <IconButton icon="refresh" look="bare" tip="left" label={svAdmin.people.replace(x.name)}
                  onClick={async () => { if (confirm(svAdmin.share.confirmReplace)) put(await api.renewPerson(t.id, x.id)); }} />
              </>}
            </span>
          </div>
        );
      })}
      <div className="add"><IconButton icon="plus" label={sv.addPerson} onClick={add} tip="right" /></div> {/* AU-26, UI-09 */}
      {copied && <p className="ro" role="status">{svAdmin.people.copied(copied)}</p>}
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

/** The trip's settings. A Planerare sees the trip's own settings; the app settings, API key and deleting are for the superuser (AU-14). */
export function AdminPage({ t, superuser, settings, back, edit, addPerson, change, run, removeTrip, openSettings }: {
  t: Trip; superuser: boolean; settings?: Settings; back: () => void; edit: (d: EditDlg) => void; addPerson: () => void; run: Run;
  change: (ops: Op[], reason: string) => void; removeTrip: () => void; openSettings: () => void;
}) {
  return <>
    <div className="top"><IconButton icon="back" label={sv.back} onClick={back} tip="right" /></div><h1>{sv.admin}</h1>
    <div className="card"><h3>{sv.tripDetails}</h3><div className="row mid"><span>{t.title}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editTrip} onClick={() => edit({ kind: "trip" })} /></div>
      <div className="row mid"><span>{sv.tripDates}: {tripRange(t) ? tripDates(t) : sv.noDates}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editDates} onClick={() => edit({ kind: "dates" })} /></div>
      <div className="row mid"><span>{sv.budgetMax}: {t.budgetMax !== undefined ? money(t.budgetMax, t.currency) : sv.noBudgetMax}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editBudgetMax} onClick={() => edit({ kind: "budgetMax" })} /></div></div>
    <PeopleLinks t={t} add={addPerson} />
    {superuser && <Permissions t={t} run={run} />}
    <ShareLink t={t} />
    {superuser && (t.inbox || maskedToken()) && (
      <div className="card">
        {t.inbox && <><h3>{sv.inbox}</h3><p>{sv.inboxText} <b>{t.inbox}</b></p></>}
        {maskedToken() && <><h3>{sv.apiKey}</h3><p>{maskedToken()}</p></>}
      </div>
    )}
    {superuser && settings && <TripAi s={settings} on={t.ai} openSettings={openSettings} onChange={(on) => change([{ op: "set", path: "ai", value: on }], on ? "AI on for trip" : "AI off for trip")} />}
    {superuser && <div className="card danger"><h3>{sv.danger}</h3><IconButton icon="trash" look="red" label={sv.deleteTrip} onClick={removeTrip} tip="right" /></div>}
  </>;
}
