// BK-26, BK-27: the trip's one mail address, for bookings and wishes: a mail button where it is used, and a dialog to copy it.
import { useEffect, useRef, useState } from "react";
import type { Trip } from "@trip/schema";
import { api } from "./api.ts";
import { sv } from "./sv.ts";
import { IconButton } from "./Icons.tsx";
import { onOutside } from "./outside.ts";

/** Whether mail import is set up for this viewer; the address is made only when the button is pressed (BK-26). */
function useMailIn(t: Trip, may: boolean) {
  const [box, setBox] = useState<{ enabled: boolean; address?: string }>({ enabled: false });
  useEffect(() => {
    if (!may) { setBox({ enabled: false }); return; }
    let live = true;
    api.inbox(t.id).then((b) => { if (live) setBox(b); }, () => {}); // offline or not allowed: no button
    return () => { live = false; };
  }, [t.id, may]);
  return box;
}

/** The mail icon button "Mejla in till resan" and its dialog (BK-27). */
export function MailInButton({ t, may, tip = "left" }: { t: Trip; may: boolean; tip?: "left" | "right" }) {
  const box = useMailIn(t, may);
  const [address, setAddress] = useState<string | null>(null), [err, setErr] = useState(false);
  if (!box.enabled) return null;
  const open = async () => {
    setErr(false);
    try { setAddress(box.address ?? t.inbox ?? (await api.openInbox(t.id)).address); } catch { setErr(true); }
  };
  return <>
    <IconButton icon="mail" look="bare" tip={tip} label={sv.mailIn.open} onClick={() => void open()} />
    {err && <span className="err" role="alert">{sv.mailIn.failed}</span>}
    {address && <MailInDialog address={address} close={() => setAddress(null)} />}
  </>;
}

function MailInDialog({ address, close }: { address: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    document.body.style.overflow = "hidden"; // PL-14
    return () => { document.body.style.overflow = ""; opener?.focus(); };
  }, []);
  const copy = async () => { try { await navigator.clipboard.writeText(address); setCopied(true); } catch { /* the field can still be copied by hand */ } };
  return (
    <dialog ref={ref} aria-label={sv.mailIn.open} onClose={close}
      onClick={onOutside(close)}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} /></span>
      <h3>{sv.mailIn.open}</h3>
      <p className="ro note">{sv.mailIn.hint}</p>
      <div className="row mid">
        <input className="linkfield" readOnly value={address} aria-label={sv.mailIn.open} onFocus={(e) => e.currentTarget.select()} />
        <span className="end"><IconButton icon="copy" look="bare" tip="left" label={sv.mailIn.copy} onClick={copy} /></span>
      </div>
      {copied && <p className="ro" role="status">{sv.mailIn.copied}</p>}
    </dialog>
  );
}
