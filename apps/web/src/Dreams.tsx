// The dream board on Önska (DB-01..DB-04), loaded on demand so the main page stays small (PF-01).
import type { Trip } from "@trip/schema";
import { categoryIcon } from "./categories.ts";
import { sv } from "./sv.ts";
import { IconButton } from "./Icons.tsx";
import { CatIcon, ICONS } from "./CatIcon.tsx";

const DREAM_BG = ["#E8D5C4", "#D5E0D8", "#EFE2BF"];

export default function Dreams({ t, write, vote, addDream }: { t: Trip; write: boolean; vote: (i: number) => void; addDream: () => void }) {
  return <>
    <div className="dreams">{t.dreams.map((d, i) => (
      <article className="card dream" key={d.id}>
        <div className="img" style={{ background: ICONS[d.category] ? `color-mix(in srgb, ${ICONS[d.category].color} 22%, var(--card))` : DREAM_BG[i % 3] }}>
          <CatIcon id={categoryIcon(d.category) ?? d.icon} big /></div>
        <button className="heart" onClick={() => vote(i)} aria-label={sv.vote} disabled={!write}>♥ {d.votes}</button>
        <div className="in"><h3>{d.title}</h3><span className="badge">{d.category}</span><div className="src">{d.source}</div></div>
      </article>
    ))}</div>
    {write && <IconButton icon="plus" look="fab" tip="up" label={sv.addDream} onClick={addDream} />}
  </>;
}
