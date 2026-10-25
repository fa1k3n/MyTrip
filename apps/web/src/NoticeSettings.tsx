// The person's own settings for notices on this phone, behind the bell on the trip page (NT-03). Loaded on demand (PF-01).
import { useEffect, useState } from "react";
import { api, installed } from "./api.ts";
import { keyBytes, noticesKey, noticeState } from "./notices.ts";
import { sv } from "./sv.ts";

const hasPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const stored = (tripId: string) => { try { return localStorage.getItem(noticesKey(tripId)) === "on"; } catch { return false; } };

export default function NoticeSettings({ tripId }: { tripId: string }) {
  const [key, setKey] = useState(true), [on, setOn] = useState(() => stored(tripId));
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [, redraw] = useState(0);
  useEffect(() => { api.pushKey().then(() => setKey(true), () => setKey(false)); }, []);
  const state = noticeState({ push: hasPush(), iphone: /iPhone/.test(navigator.userAgent), installed, permission: hasPush() ? Notification.permission : "default", key, on });
  const toggle = async () => {
    setErr(""); setBusy(true);
    try {
      if (state === "off") {
        // The permission is asked first, while the tap still counts as the user's own act (Safari requires it).
        if ((await Notification.requestPermission()) !== "granted") return redraw((n) => n + 1);
        const reg = await navigator.serviceWorker.ready, { key: k } = await api.pushKey();
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k) }));
        await api.subscribe(tripId, sub.toJSON());
        try { localStorage.setItem(noticesKey(tripId), "on"); } catch { /* storage blocked */ }
        setOn(true);
      } else {
        const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
        if (sub) await api.unsubscribe(tripId, sub.endpoint); // the phone's subscription stays for its other trips
        try { localStorage.removeItem(noticesKey(tripId)); } catch { /* storage blocked */ }
        setOn(false);
      }
    } catch { setErr(sv.notice.failed); } finally { setBusy(false); }
  };
  const why = { install: sv.notice.install, unsupported: sv.notice.unsupported, denied: sv.notice.denied, serverOff: sv.notice.serverOff } as const;
  return <>
    <h3>{sv.notice.title}</h3>
    {state === "on" || state === "off" ? <>
      <label className="check"><input type="checkbox" checked={state === "on"} disabled={busy} onChange={toggle} />{sv.notice.on}</label>
      <p className="ro">{state === "on" ? sv.notice.onText : sv.notice.offText}</p>
    </> : <p className="ro">{why[state]}</p>}
    {err && <p className="err" role="alert">{err}</p>}
  </>;
}
