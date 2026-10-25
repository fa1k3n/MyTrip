// The dialog behind the eye of a hidden activity or day: whom each activity is hidden from (AU-25). Loaded on demand (PF-01).
import type { Trip } from "@trip/schema";
import { hiddenRows } from "./hiddenView.ts";
import { svAdmin } from "./sv-admin.ts";

export default function HiddenView({ t, dayId, id }: { t: Trip; dayId: string; id?: string }) {
  return <>
    <h3>{svAdmin.hidden.title}</h3>
    <ul className="hiddenlist">{hiddenRows(t, dayId, id).map((r) => (
      <li key={r.id}><b>{r.time} {r.text}</b><span>{r.names}</span>{r.like && <small className="ro">{svAdmin.hidden.like(r.like)}</small>}</li>
    ))}</ul>
  </>;
}
