// The place window (PL-01..PL-16) and the transport panel behind the clock (TM-04, TR-01..TR-19).
import { useEffect, useState } from "react";
import type { Trip } from "@trip/schema";
import { api, offlineState } from "./api.ts";

/** Maps and the traffic check need a network; offline they give way to a short explanation (PW-10). */
const offline = () => !navigator.onLine || offlineState() !== null;
const NeedsNet = () => <p className="ro mapoff">{sv.offline.needsNet}</p>;
import { dayTime } from "./format.ts";
import { directionsUrl, fmtDuration, mapEmbedUrl, routeOf, vehicleTimes, type Traffic } from "./transport.ts";
import { IconButton } from "./Icons.tsx";
import { placeView } from "./place.ts";
import { CatIcons, LineIcon } from "./CatIcon.tsx";

const VEHICLE_IDS: Record<string, string[]> = { "🚗": ["car"], "🚢": ["ferry"], "🚆": ["train"], "🚇🚶": ["transit", "walk"] };
import { sv } from "./sv.ts";

export function PlaceView({ t, id, edit }: { t: Trip; id: string; edit?: () => void }) {
  const place = t.places.find((x) => x.id === id);
  if (!place) return null;
  const v = placeView(place);
  return <>
    <div className="dh"><h3>{v.name}</h3>{edit && <IconButton icon="edit" look="bare" tip="left" label={sv.editPlace} onClick={edit} mut />}</div>
    <p className="adr">{v.address}</p>
    {v.notes && <p className="ro">{v.notes}</p>}
    <p className="links">
      {v.phone && <a href={v.phone.href}>{v.phone.text}</a>}
      <a href={v.mapsUrl} target="_blank" rel="noopener">{sv.openInMaps}</a>
    </p>
    {(v.booking || v.website) && (
      <div className="dlgbar">
        {v.booking && <a className="btn" href={v.booking.url} target="_blank" rel="noopener">{v.booking.label}</a>}
        {v.website && <a className="btn ghost" href={v.website} target="_blank" rel="noopener">{sv.website}</a>}
      </div>
    )}
    {/* Rendered only while the window is open, so the map loads on demand (PL-07, CP-06). */}
    {offline() ? <NeedsNet /> : <iframe className="mapframe" title={sv.mapTitle} src={v.embedUrl} loading="lazy" />}
  </>;
}

function trafficLines(x: Traffic | "loading"): { warn: boolean; lines: string[] } {
  if (x === "loading") return { warn: false, lines: [sv.trafficChecking] };
  if (x.status === "off") return { warn: false, lines: [sv.trafficOff] };
  if (x.status === "error" || x.status === "none") return { warn: false, lines: [sv.trafficError] };
  if (x.status === "ok") return { warn: false, lines: [sv.trafficOk(fmtDuration(x.durationMin))] };
  return { warn: true, lines: [x.delayMin > 0 ? sv.trafficDelay(x.delayMin) : "", x.jam ? sv.trafficJam : ""].filter(Boolean) };
}

export function TransportView({ t, dayId }: { t: Trip; dayId: string }) {
  const day = t.days.find((d) => d.id === dayId);
  const route = day ? routeOf(day) : null;
  const [traffic, setTraffic] = useState<Traffic | "loading">("loading");
  useEffect(() => {
    if (!route) return;
    let live = true;
    api.traffic(t.id, dayId).then((r) => live && setTraffic(r), () => live && setTraffic({ status: "error" }));
    return () => { live = false; };
  }, [t.id, dayId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!day) return null;
  const { warn, lines } = trafficLines(traffic);
  return <>
    <div className="dh"><h3><LineIcon shape="clock" /> {dayTime(day)}</h3></div>
    {vehicleTimes(day).map((v) => (
      <div className="veh" key={v.icon}><span className="vi"><CatIcons ids={VEHICLE_IDS[v.icon] ?? []} /></span><span className="sr">{sv.vehicleNames[v.icon]}: </span><span>{v.text}</span></div>
    ))}
    {route && <>
      {offline() ? <NeedsNet /> : <>
        <div className={`tst ${warn ? "warn" : ""}`} role="status">{lines.map((l) => <div key={l}>{l}</div>)}</div>
        <iframe className="mapframe" title={sv.trafficMapTitle} src={mapEmbedUrl(route)} loading="lazy" />
      </>}
      <p className="ro">{sv.noBreaks}</p>
    </>}
    {route && <div className="dlgbar"><a className="btn" href={directionsUrl(route)} target="_blank" rel="noopener">{sv.openRoute}</a></div>}
  </>;
}
