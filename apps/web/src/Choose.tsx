// The start page with the trips of the links on the phone (PW-16, PW-17). Loaded on demand (PF-01).
import { useEffect, useState } from "react";
import type { Trip } from "@trip/schema";
import { api, ApiError, deviceLinks, removeDeviceLink } from "./api.ts";
import { loadCopy, loadQueue } from "./offline.ts";
import { noticesKey } from "./notices.ts";
import { tripOfLink } from "./access.ts";
import { excerpt, tripDates } from "./format.ts";
import { IconButton } from "./Icons.tsx";
import { sv } from "./sv.ts";

type Card = { key: string; trip?: Trip; cover?: string };

/** A trip leaving the phone takes its notices along (NT-03, PW-17); best effort, the server also drops them with the link. */
function stopNotices(key: string) {
  const tripId = tripOfLink(key);
  try { if (localStorage.getItem(noticesKey(tripId)) !== "on") return; localStorage.removeItem(noticesKey(tripId)); } catch { return; }
  navigator.serviceWorker?.ready.then((r) => r.pushManager.getSubscription())
    .then((sub) => sub && api.unsubscribe(tripId, sub.endpoint, key)).catch(() => {});
}

export default function Choose({ onPick }: { onPick: (key: string) => void }) {
  const [cards, setCards] = useState<Card[]>(() => deviceLinks().map((key) => ({ key })));
  const [gone, setGone] = useState(false);
  useEffect(() => {
    for (const key of deviceLinks()) {
      api.tripsAs(key).then(async ([trip]) => {
        setCards((c) => c.map((x) => (x.key === key ? { ...x, trip } : x)));
        const cover = trip?.image ? await api.image(trip.id, key).catch(() => undefined) : undefined;
        if (cover) setCards((c) => c.map((x) => (x.key === key ? { ...x, cover } : x)));
      }, (e) => {
        if (!(e instanceof ApiError && e.status === 401)) { // offline or a server error: keep the link, with the trip the phone kept (PW-03)
          let kept: Trip | undefined;
          try { kept = (loadCopy(localStorage, key)?.trips as Trip[] | undefined)?.[0]; } catch { /* storage blocked */ }
          if (kept) setCards((c) => c.map((x) => (x.key === key ? { ...x, trip: kept } : x)));
          return;
        }
        removeDeviceLink(key); // the server no longer accepts it (AU-07, PW-17)
        setCards((c) => c.filter((x) => x.key !== key));
        setGone(true);
      });
    }
  }, []);
  useEffect(() => { if (cards.length === 1) onPick(cards[0].key); }, [cards.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = (x: Card) => {
    let n = 0;
    try { n = loadQueue(localStorage, x.key).length; } catch { /* storage blocked */ }
    if (!confirm(sv.choose.removeAsk(x.trip?.title ?? tripOfLink(x.key)) + (n ? ` ${sv.choose.unsent(n)}` : ""))) return; // PW-17
    stopNotices(x.key);
    removeDeviceLink(x.key);
    setCards((c) => c.filter((y) => y.key !== x.key));
  };
  return <>
    <div className="top"><div className="logo">{sv.hub}</div></div>
    {gone && <p className="ro" role="status">{sv.choose.gone}</p>}
    <div className="grid">
      {cards.map((x) => (
        <div className="tripwrap" key={x.key}>
          <button className="card trip" onClick={() => onPick(x.key)}>
            {x.cover && <img className="cover" src={x.cover} alt="" />}
            <h3>{x.trip?.title ?? tripOfLink(x.key)}</h3>
            {x.trip && <><div className="ro">{tripDates(x.trip)}</div><p className="sum">{x.trip.hiddenPurpose ? sv.hiddenText : excerpt(x.trip.purpose)}</p></>}
          </button>
          <span className="rm"><IconButton icon="trash" look="bare" tip="left" label={sv.choose.remove(x.trip?.title ?? tripOfLink(x.key))} onClick={() => remove(x)} /></span>
        </div>
      ))}
    </div>
  </>;
}
