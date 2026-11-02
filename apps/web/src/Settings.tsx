// The app settings under the gear on Drömmar: AI for all trips (AI-06..AI-09), and the API key and image cache for the superuser (MT-13).
import { useEffect, useState } from "react";
import { CAP_ACCOUNT_USD, CAP_USD, type AiArea, type Op, type Settings, type Trip } from "@trip/schema";
import { api, maskedToken, type HelperStatus } from "./api.ts";
import { IconButton } from "./Icons.tsx";
import { startAi } from "./aiStart.ts";
import { sv } from "./sv.ts";
import { aiConsentLine, capValue, helperLine } from "./format.ts";
import { ask } from "./Ask.tsx"; // UI-11
import { Users } from "./Users.tsx";
import { BetaNotes, BetaUsage } from "./Beta.tsx";

/** On/off switch with an explanation shown on hover or keyboard focus, and read by screen readers. */
export function Switch({ id, label, tip, checked, onChange }: { id: string; label: string; tip: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="check switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={`tip-${id}`} />
      {label}
      <span className="tip" id={`tip-${id}`} role="tooltip">{tip}</span>
    </label>
  );
}

/** The trip's single AI switch; shown only while AI is on for the instance (AI-62). */
export function TripAi({ s, on, consent, onChange, openSettings }: { s: Settings; on: boolean; consent?: { by: string; at: string }; onChange: (on: boolean) => void; openSettings: () => void }) {
  return (
    <div className="card">
      <h3>{sv.ai}</h3>
      {s.ai.enabled
        ? <Switch id="trip-ai" label={sv.tripAi} tip={sv.tripAiTip} checked={on} onChange={onChange} />
        : <p>{sv.aiOffAll} <button className="place" onClick={openSettings}>{sv.aiOpenSettings}</button></p>}
      {consent && <p className="ro note">{aiConsentLine(consent)}</p>}
    </div>
  );
}

/** The trip's AI helpers for those who plan it: a switch each, a "Kör nu" button, the latest run and the runs left (AI-68, AI-72).
 * Turning one on asks for the agreement first when the trip has none (AI-64). */
export function AiHelpers({ t, change, reload }: { t: Trip; change: (ops: Op[], reason: string) => void | Promise<unknown>; reload: () => void | Promise<unknown> }) {
  const [st, setSt] = useState<Record<string, HelperStatus> | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const refresh = () => api.aiStatus(t.id).then((r) => setSt(r.helpers), () => setSt(null));
  useEffect(() => { void refresh(); }, [t.id, t.revision]); // eslint-disable-line react-hooks/exhaustive-deps -- again after each change
  const shown = Object.entries(st ?? {}).filter(([, h]) => h.available);
  if (!shown.length) return null;
  const runNow = async (name: string) => {
    setBusy(name); setMsg("");
    const r = await startAi(t.id, name);
    if (r) setMsg("message" in r ? r.message : sv.aiRun.ran(r.proposalIds.length));
    setBusy(""); void refresh();
  };
  const flip = async (name: string, on: boolean) => {
    setMsg("");
    if (on && !t.aiConsent) {
      if (!(await ask(sv.aiRun.consentAsk, { ok: sv.aiRun.consentOk, details: sv.aiRun.consentDetails }))) return;
      try { await api.aiConsent(t.id, name); } catch { setMsg(sv.aiRun.errors.network); return; }
      await reload(); // the agreement and the switch came in one change
    } else await change([{ op: "set", path: "aiHelpers", value: { ...t.aiHelpers, [name]: on } }], `ai helper ${name} ${on ? "on" : "off"}`);
    if (on) await runNow(name);
  };
  return <div className="card"><h3>{sv.aiRun.helpersTitle}</h3><p className="ro note">{sv.aiRun.helpersLead}</p>
    {shown.map(([name, h]) => { const [label, tip] = sv.aiRun.helpers[name] ?? [name, ""]; return <div key={name}>
      <div className="row mid"><Switch id={`helper-${name}`} label={label} tip={tip} checked={h.on} onChange={(on) => void flip(name, on)} />
        <IconButton icon="refresh" look="bare" tip="left" label={sv.aiRun.runNow(label)} disabled={!!busy} onClick={() => void runNow(name)} /></div>
      <p className="ro note" role="status">{busy === name ? sv.loading : helperLine(h, t.timezone)}</p></div>; })}
    {msg && <p className="ro note" role="status">{msg}</p>}
  </div>;
}

export function AiSettings({ s, service, onChange }: { s: Settings; service: boolean; onChange: (next: Settings) => void }) {
  const set = (enabled: boolean, areas = s.ai.areas) => onChange({ ...s, ai: { ...s.ai, enabled, areas } });
  return (
    <div className="card">
      <h3>{sv.ai}</h3>
      {!service && <p className="ro">{sv.aiNoService}</p>}
      <Switch id="ai" label={sv.aiMain} tip={sv.aiPrivacy} checked={s.ai.enabled} onChange={(on) => set(on)} />
      {s.ai.enabled && (
        <fieldset className="sub">
          <legend className="ro">{sv.aiPerArea}</legend>
          {(Object.keys(sv.aiAreas) as AiArea[]).map((a) => (
            <Switch key={a} id={a} label={sv.aiAreas[a][0]} tip={sv.aiAreas[a][1]} checked={s.ai.areas[a] !== false}
              onChange={(on) => set(true, { ...s.ai.areas, [a]: on })} />
          ))}
          <Cap label={sv.aiRun.capUsd} value={s.ai.capUsd} onChange={(capUsd) => onChange({ ...s, ai: { ...s.ai, capUsd } })} />
          <Cap label={sv.aiRun.capAccountUsd} value={s.ai.capAccountUsd} onChange={(capAccountUsd) => onChange({ ...s, ai: { ...s.ai, capAccountUsd } })} />
          <p className="ro note">{sv.aiRun.capHint(CAP_USD, CAP_ACCOUNT_USD)}</p>
        </fieldset>
      )}
    </div>
  );
}

/** A monthly spending cap in USD, saved when the field is left; empty means the default (AI-03). */
function Cap({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? "" : String(value).replace(".", ","));
  const v = capValue(text);
  return <label>{label}
    <input value={text} inputMode="decimal" aria-invalid={v === null} onChange={(e) => setText(e.target.value)} onBlur={() => { if (v !== null && v !== value) onChange(v); }} />
    {v === null && <span className="err" role="alert">{sv.aiRun.capInvalid}</span>}
  </label>;
}

/** Emptying the image cache of ended trips, for the superuser, with the count and size in the confirmation (DB-13). */
function ImageCache() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const kb = (b: number) => Math.round(b / 1024);
  const empty = async () => {
    setBusy(true); setMsg("");
    try {
      const s = await api.endedCache();
      if (!s.images && !s.files) setMsg(sv.wish.cacheEmpty);
      else if (await ask(sv.wish.cacheAsk(s.images, kb(s.bytes)))) { const r = await api.clearEndedCache(); setMsg(sv.wish.cacheDone(r.images, kb(r.bytes))); }
    } catch { setMsg(sv.wish.failed); }
    setBusy(false);
  };
  return <div className="card"><h3>{sv.wish.cache}</h3><p className="ro">{sv.wish.cacheText}</p>
    <button className="btn ghost" type="button" disabled={busy} onClick={empty}>{sv.wish.cacheButton}</button>
    {msg && <p className="ro note" role="status">{msg}</p>}</div>;
}

/** What only the superuser sees in the app settings: the accounts (US-02), the masked API key and the image cache (MT-13). */
export function AppAdmin() {
  return <>
    <Users />
    <BetaNotes />
    <BetaUsage />
    {maskedToken() && <div className="card"><h3>{sv.apiKey}</h3><p>{maskedToken()}</p></div>}
    <ImageCache />
  </>;
}
