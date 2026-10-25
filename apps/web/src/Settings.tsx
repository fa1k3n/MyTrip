// Gear button (MT-10) and the instance-wide AI settings (AI-06..AI-09).
import type { AiArea, Settings } from "@trip/schema";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";

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
