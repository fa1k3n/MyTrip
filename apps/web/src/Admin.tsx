// The trip's settings page, the admin login and the share link. Loaded on demand (PF-01).
import { useEffect, useState, type FormEvent } from "react";
import type { Op, Settings, Trip } from "@trip/schema";
import { api, ApiError, maskedToken } from "./api.ts";
import { shareUrl } from "./access.ts";
import { tripRange } from "./edit.ts";
import { tripDates } from "./format.ts";
import { money } from "./budget.ts";
import { IconButton } from "./Icons.tsx";
import { TripAi } from "./Settings.tsx";
import type { EditDlg } from "./editKinds.ts";
import { sv } from "./sv.ts";

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
    if (secret && !confirm(sv.share.confirmReplace)) return;
    setSecret((await api.newLink(t.id)).secret);
    setCopied(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { /* the field can still be copied by hand */ }
  };
  return (
    <div className="card">
      <h3>{sv.share.title}</h3>
      <p className="ro note">{sv.share.hint}</p>
      {secret && <input readOnly value={url} aria-label={sv.share.title} onFocus={(e) => e.currentTarget.select()} />}
      {secret !== undefined && (
        <div className="row mid">
          <span className="ro">{copied ? sv.share.copied : secret ? "" : sv.share.none}</span>
          <span className="end">
            {secret && <IconButton icon="copy" look="bare" tip="left" label={sv.share.copy} onClick={copy} />}
            <IconButton icon={secret ? "refresh" : "plus"} look="bare" tip="left" label={secret ? sv.share.replace : sv.share.create} onClick={make} />
          </span>
        </div>
      )}
    </div>
  );
}

export function AdminPage({ t, settings, back, edit, change, removeTrip, openSettings }: {
  t: Trip; settings?: Settings; back: () => void; edit: (d: EditDlg) => void;
  change: (ops: Op[], reason: string) => void; removeTrip: () => void; openSettings: () => void;
}) {
  return <>
    <div className="top"><IconButton icon="back" label={sv.back} onClick={back} tip="right" /></div><h1>{sv.admin}</h1>
    <div className="card"><h3>{sv.tripDetails}</h3><div className="row mid"><span>{t.title}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editTrip} onClick={() => edit({ kind: "trip" })} /></div>
      <div className="row mid"><span>{sv.tripDates}: {tripRange(t) ? tripDates(t) : sv.noDates}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editDates} onClick={() => edit({ kind: "dates" })} /></div>
      <div className="row mid"><span>{sv.budgetMax}: {t.budgetMax !== undefined ? money(t.budgetMax, t.currency) : sv.noBudgetMax}</span><IconButton icon="edit" look="bare" tip="left" label={sv.editBudgetMax} onClick={() => edit({ kind: "budgetMax" })} /></div></div>
    <ShareLink t={t} />
    {(t.inbox || maskedToken()) && (
      <div className="card">
        {t.inbox && <><h3>{sv.inbox}</h3><p>{sv.inboxText} <b>{t.inbox}</b></p></>}
        {maskedToken() && <><h3>{sv.apiKey}</h3><p>{maskedToken()}</p></>}
      </div>
    )}
    {settings && <TripAi s={settings} on={t.ai} openSettings={openSettings} onChange={(on) => change([{ op: "set", path: "ai", value: on }], on ? "AI on for trip" : "AI off for trip")} />}
    <div className="card danger"><h3>{sv.danger}</h3><IconButton icon="trash" look="red" label={sv.deleteTrip} onClick={removeTrip} tip="right" /></div>
  </>;
}
