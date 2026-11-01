// The app settings under the gear on Drömmar: AI for all trips (AI-06..AI-09), and the API key and image cache for the superuser (MT-13).
import { useState } from "react";
import type { AiArea, Settings } from "@trip/schema";
import { api, maskedToken } from "./api.ts";
import { sv } from "./sv.ts";
import { ask } from "./Ask.tsx"; // UI-11

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
export function TripAi({ s, on, onChange, openSettings }: { s: Settings; on: boolean; onChange: (on: boolean) => void; openSettings: () => void }) {
  return (
    <div className="card">
      <h3>{sv.ai}</h3>
      {s.ai.enabled
        ? <Switch id="trip-ai" label={sv.tripAi} tip={sv.tripAiTip} checked={on} onChange={onChange} />
        : <p>{sv.aiOffAll} <button className="place" onClick={openSettings}>{sv.aiOpenSettings}</button></p>}
    </div>
  );
}

export function AiSettings({ s, service, onChange }: { s: Settings; service: boolean; onChange: (next: Settings) => void }) {
  const set = (enabled: boolean, areas = s.ai.areas) => onChange({ ...s, ai: { enabled, areas } });
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
        </fieldset>
      )}
    </div>
  );
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

/** What only the superuser sees in the app settings: the masked API key and the image cache (MT-13). */
export function AppAdmin() {
  return <>
    {maskedToken() && <div className="card"><h3>{sv.apiKey}</h3><p>{maskedToken()}</p></div>}
    <ImageCache />
  </>;
}
