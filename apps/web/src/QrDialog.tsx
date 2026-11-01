// The QR code dialog for a link: drawn here, so the link never leaves the device (AU-31, US-04).
import { useEffect, useRef } from "react";
import { IconButton } from "./Icons.tsx";
import { qr, qrSvgPath } from "./qr.ts";
import { sv } from "./sv.ts";
import { svAdmin } from "./sv-admin.ts";

/** AU-31: a link as a QR code, to show on this screen to the one who is invited. Drawn here, so the link stays on the device. */
export function QrDialog({ url, name, close }: { url: string; name: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!, opener = document.activeElement as HTMLElement | null;
    d.showModal();
    document.body.style.overflow = "hidden"; // PL-14
    return () => { document.body.style.overflow = ""; opener?.focus(); };
  }, []);
  const { path, box } = qrSvgPath(qr(url));
  return (
    <dialog ref={ref} aria-label={svAdmin.qr.title(name)} onClose={close}
      onClick={(e) => { // backdrop clicks land on the dialog itself, outside its box (PL-12)
        const r = e.currentTarget.getBoundingClientRect();
        if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) close();
      }}>
      <span className="dlg-x"><IconButton icon="close" look="bare" tip="left" label={sv.close} onClick={close} /></span>
      <h3>{svAdmin.qr.title(name)}</h3>
      <svg className="qr" viewBox={`0 0 ${box} ${box}`} role="img" aria-label={svAdmin.qr.label(name)} shapeRendering="crispEdges">
        <rect width={box} height={box} className="qrbg" /><path d={path} />
      </svg>
      <p className="ro note">{svAdmin.qr.hint}</p>
    </dialog>
  );
}
