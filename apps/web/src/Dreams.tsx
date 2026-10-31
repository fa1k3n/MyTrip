// The dream board on Önska (DB-01..DB-04), loaded on demand so the main page stays small (PF-01).
import type { ReactNode } from "react";
import type { Trip } from "@trip/schema";
import { categoryIcon } from "./categories.ts";
import { sv } from "./sv.ts";
import { IconButton } from "./Icons.tsx";
import { CatIcon, ICONS } from "./CatIcon.tsx";
import { HiddenText, TextEye } from "./TripView.tsx";

const DREAM_BG = ["#E8D5C4", "#D5E0D8", "#EFE2BF"];

/** A wish's card, the same in Önska and in Minnas (DB-01, DB-02, MI-16); without `vote` the heart is read-only, and Minnas shows none. */
export function DreamCard({ t, d, i, vote, votes = true, children }: { t: Trip; d: Trip["dreams"][number]; i: number; vote?: () => void; votes?: boolean; children?: ReactNode }) {
  return (
    <article className="card dream">
      <div className="img" style={{ background: ICONS[d.category] ? `color-mix(in srgb, ${ICONS[d.category].color} 22%, var(--card))` : DREAM_BG[i % 3] }}>
        <CatIcon id={categoryIcon(d.category) ?? d.icon} big /></div>
      {votes && <button className="heart" onClick={vote} aria-label={sv.vote} disabled={!vote}>♥ {d.votes}</button>}
      <div className="in"><h3>{d.hidden ? <HiddenText /> : <>{d.title}<TextEye t={t} texts={[d.title, d.source]} /></>}</h3><span className="badge">{d.category}</span><div className="src">{d.source}</div>{children}</div>
    </article>
  );
}

export default function Dreams({ t, write, vote, addDream }: { t: Trip; write: boolean; vote: (i: number) => void; addDream: () => void }) {
  return <>
    <div className="dreams">{t.dreams.map((d, i) => <DreamCard key={d.id} t={t} d={d} i={i} vote={write ? () => vote(i) : undefined} />)}</div>
    {write && <IconButton icon="plus" look="fab" tip="up" label={sv.addDream} onClick={addDream} />}
  </>;
}
