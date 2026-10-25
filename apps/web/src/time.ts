// Clock times as minutes after midnight, so durations and gaps can be computed (ED-15..ED-17).

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Clamped to the same day: 00:00 to 24:00. */
export const fromMin = (m: number) => {
  const v = Math.max(0, Math.min(24 * 60, Math.round(m)));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

/** When the activity ends: a fixed end, or start plus the estimated duration. */
export function activityEnd(a: { start?: string; end?: string; durationMin?: number }) {
  if (a.end) return a.end;
  return a.start && a.durationMin ? fromMin(toMin(a.start) + a.durationMin) : undefined;
}
