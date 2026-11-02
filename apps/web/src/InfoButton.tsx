// A small "i" that opens an explanation in a dialog, for touch screens where a tooltip never shows (AI-74).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";
import { onOutside } from "./outside.ts";

export function InfoButton({ title, lines, label }: { title: string; lines: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <IconButton icon="info" look="bare" tip="left" label={label} onClick={() => setOpen(true)} />
    {open && createPortal(<InfoDialog title={title} lines={lines} close={() => setOpen(false)} />, document.body) /* not inside a row: it would inherit nowrap */}
  </>;
}

function InfoDialog({ title, lines, close }: { title: string; lines: string[]; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    document.body.style.overflow = "hidden"; // PL-14
    return () => { document.body.style.overflow = ""; opener?.focus(); };
  }, []);
  return (
    <dialog ref={ref} aria-label={title} onClose={close}
      onClick={onOutside(close)}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} /></span>
      <h3>{title}</h3>
      {lines.map((x) => <p key={x}>{x}</p>)}
    </dialog>
  );
}
