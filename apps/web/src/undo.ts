// Ångra after a change in Nåla (ED-22). Pure, so it runs under node --test.
import type { Op, Trip } from "@trip/schema";
import { applyOps } from "@trip/schema/src/ops.ts";
import { sv } from "./sv.ts";

/** The changes in Nåla that offer Ångra: moves, planned wishes and removals. */
export const UNDOABLE = new Set(["move activity", "plan wish", "remove ai", "keep ai", "remove activity", "remove booking", "remove budget", "remove task", "remove place", "remove info"]);

/** Sets back each part of the trip that the change altered; sent on the revision after it, so a change in between makes it fail (MC-05). */
export const undoOps = (before: Trip, after: Trip): Op[] =>
  ([...new Set([...Object.keys(before), ...Object.keys(after)])] as (keyof Trip)[]).filter((k) => k !== "revision" && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => (k in before ? { op: "set", path: k, value: before[k] } : { op: "remove", path: k }));

const files = (t: Trip) => [...t.bookings.flatMap((b) => (b.files ?? []).map((f) => f.id)), ...t.dreams.flatMap((w) => (w.image?.kind === "own" ? [w.image.file] : []))];
/** Not when the change removed files: the server deletes them at once, so they cannot come back (BK-13, DB-08). */
export const canUndo = (before: Trip, after: Trip) => { const kept = new Set(files(after)); return files(before).every((f) => kept.has(f)); };
/** The question before a removal in Nåla: Ångra can undo it, unless it deletes ticket files (ED-09, ED-26). */
export const removeAsk = (t: Trip, ops: Op[]) => (canUndo(t, applyOps(t, ops)) ? sv.confirmRemove : sv.confirmRemoveFiles);
