// The verdict buttons on a wish that came true, in Minnen and on an ended activity's card in Uppleva (MI-17, MI-18, MI-28, UP-50).
import { useEffect, useRef } from "react";
import type { Trip } from "@trip/schema";
import { memoryOps, mineOf, verdictCounts, VERDICTS } from "./memories.ts";
import { IconButton, Icon } from "./Icons.tsx";
import { sv } from "./sv.ts";
import type { Run } from "./TripView.tsx";
import { isOffline, verdictQueue } from "./api.ts";
import { queueVerdict } from "./offline.ts";

const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; // AC-06

/** A verdict's count in the button's corner: it pops when it grows, bounces when it shrinks and shrinks away at zero (MI-17, MI-28). */
function Count({ n }: { n: number }) {
  const el = useRef<HTMLSpanElement>(null), was = useRef(n);
  useEffect(() => {
    const e = el.current, prev = was.current;
    was.current = n;
    if (!e || prev === n || still() || typeof e.animate !== "function") return;
    e.animate(n > prev ? [{ transform: "scale(.2)" }, { transform: "scale(1.2)" }, { transform: "none" }]
      : n ? [{ transform: "scale(1.25)" }, { transform: "none" }] : [{ transform: "none", opacity: 1 }, { transform: "scale(0)", opacity: 0 }],
      { duration: 340, easing: "cubic-bezier(.34,1.56,.64,1)" });
  }, [n]);
  return <span ref={el} className="vcount" data-n={n} aria-hidden="true">{n || ""}</span>;
}

/** The three thumbs with their counts, never who (MI-18); pressable for one who may give verdicts, with the comment button when
 * `comment` is given (MI-17). */
export function Verdicts({ t, id, title, by, writes, run, comment }: { t: Trip; id: string; title: string; by?: string; writes: boolean; run: Run; comment?: () => void }) {
  const n = verdictCounts(t, id), mine = by ? mineOf(t, id, by)?.verdict : undefined;
  return <div className="verdicts">
    {VERDICTS.map((v) => <span className="verdict" key={v}>{/* the count in the corner, as the money button once had (MI-17) */}
      {writes && by ? <IconButton icon={v} tip="up" pressed={mine === v} label={sv.minnas.give(sv.minnas.verdicts[v], title, n[v])}
        onClick={() => (isOffline() ? verdictQueue.save(queueVerdict(verdictQueue.load(), { tripId: t.id, dreamId: id, by, verdict: mine === v ? null : v })) // UP-53
          : run((x) => memoryOps(x, id, by, { verdict: v }), `verdict ${v}`))} />
        : <span className="btn ghost icon" role="img" aria-label={sv.minnas.count(sv.minnas.verdicts[v], n[v])} title={sv.minnas.verdicts[v]}><Icon name={v} /></span>}
      <Count n={n[v]} />
    </span>)}
    {writes && by && comment && <IconButton icon="comment" tip="up" label={sv.minnas.write(title)} onClick={comment} />}
  </div>;
}
