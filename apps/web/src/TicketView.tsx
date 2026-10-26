// A booking's ticket files on a white background filling the screen, so scanners can read their codes (BK-10). Loaded on demand (PF-01).
import { useEffect, useState } from "react";
import type { TicketFile, Trip } from "@trip/schema";
import { bookingDates, bookingTimes } from "./format.ts";
import { ticketBlob } from "./ticketFiles.ts";
import { sv } from "./sv.ts";

function TicketPages({ tripId, f }: { tripId: string; f: TicketFile }) {
  const [pages, setPages] = useState<string[] | null | "error">(null);
  useEffect(() => {
    let live = true, made: string[] = [];
    ticketBlob(tripId, f)
      .then(async (b) => (f.type === "application/pdf"
        ? (await import("./pdf.ts")).pdfPages(b, Math.min(1600, Math.round(innerWidth * devicePixelRatio)))
        : [URL.createObjectURL(b)]))
      .then((urls) => { made = urls; if (live) setPages(urls); else urls.forEach(URL.revokeObjectURL); }, () => { if (live) setPages("error"); });
    return () => { live = false; made.forEach(URL.revokeObjectURL); };
  }, [tripId, f.id]); // eslint-disable-line react-hooks/exhaustive-deps -- a file never changes under its id
  if (pages === null) return <p className="ro">{sv.tickets.loading}</p>;
  if (pages === "error") return <p className="err" role="alert">{sv.tickets.error}</p>;
  return <>{pages.map((u, i) => <img key={u} className="ticketpage" src={u} alt={pages.length > 1 ? sv.tickets.page(f.name, i + 1) : f.name} />)}</>;
}

export default function TicketView({ t, bookingId }: { t: Trip; bookingId: string }) {
  const b = t.bookings.find((x) => x.id === bookingId);
  if (!b) return <p className="ro">{sv.tickets.error}</p>;
  const times = bookingTimes(b);
  return (
    <div className="tickets">
      <h3>{b.name}</h3>
      <p className="ro">{bookingDates(b)}{times ? ` · ${times}` : ""}{b.reference ? ` · ${b.reference}` : ""}</p>
      {(b.files ?? []).map((f) => <TicketPages key={f.id} tripId={t.id} f={f} />)}
    </div>
  );
}
