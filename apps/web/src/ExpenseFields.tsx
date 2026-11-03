// The activity an expense applies to and its category tiles, which follow each other (UP-42, UP-47, MI-41).
import { useRef, useState, type ReactNode } from "react";
import { api } from "./api.ts";
import { aiErrorText, receiptFill } from "./format.ts";
import { AiMark, IconButton } from "./Icons.tsx";
import { activityCategory, expenseTiles } from "./money.ts";
import { ShapeIcon } from "./CatIcon.tsx";
import { sv } from "./sv.ts";

export type Choice = { id: string; text: string; category?: string; activityId?: string }; // a wish in the sheet carries its activity (UP-47)
const firstTile = () => expenseTiles().find((x) => x.chosen)!.name;

/** "Gäller" and the tiles: choosing an activity chooses its category, which can still be changed; "Ingen" keeps the category. */
export function ActivityAndCategory({ choices, activity: start = "", category: startCategory, onChange, label = sv.up.applies, name = "activity" }: {
  choices: Choice[]; activity?: string; category?: string; onChange?: (v: { activity: string; category: string }) => void;
  label?: string; name?: string; // the sheet asks for a wish instead (UP-47)
}) {
  const [activity, setActivity] = useState(start);
  const [category, setCategory] = useState(startCategory ?? (start ? activityCategory(choices.find((c) => c.id === start)?.category) : firstTile()));
  const set = (a: string, c: string) => { setActivity(a); setCategory(c); onChange?.({ activity: a, category: c }); };
  return <>
    {choices.length > 0 && <label>{label}<span className="rolepick field"><select name={name} value={activity}
      onChange={(e) => set(e.target.value, e.target.value ? activityCategory(choices.find((c) => c.id === e.target.value)?.category) : category)}>
      <option value="">{sv.up.noActivity}</option>
      {choices.map((c) => <option key={c.id} value={c.id}>{c.text}</option>)}
    </select></span></label>}
    <fieldset className="tiles"><legend>{sv.category}</legend>
      {expenseTiles().map((x) => <label className="tile" key={x.name}>
        <input type="radio" name="category" value={x.name} checked={category === x.name} onChange={() => set(activity, x.name)} /><ShapeIcon shape={x.shape} /><span>{x.name}</span>
      </label>)}
    </fieldset>
  </>;
}

/** The sheet's fields for an expense without a fixed activity: Gäller with the guess, the tiles, the description (optional with an
 * activity, whose title is then used), the amount with its currency and, where asked for, who paid (UP-42, UP-43, MI-13). */
export function ExpenseSheet({ choices = [], guess, currency, payer }: { choices?: Choice[]; guess?: string; currency: ReactNode; payer?: ReactNode }) {
  const [activity, setActivity] = useState(guess ?? "");
  const chosen = choices.find((c) => c.id === activity);
  return <>
    <ActivityAndCategory choices={choices} activity={guess} label={sv.up.wish} name="dream" onChange={(v) => setActivity(v.activity)} />
    <label>{chosen ? sv.up.shortText : sv.up.what}<input name="text" maxLength={60} placeholder={chosen ? chosen.text : sv.up.whatExample} /></label>
    <div className="two">
      <label>{sv.amount.replace(" (kr)", "")}<input name="amount" inputMode="decimal" /></label>
      {currency}
    </div>
    {payer}
  </>;
}

/** AI-42: "Läs kvitto": a photo of a receipt, scaled on the phone, read by the AI service into the form around it, to check and save. */
export function ReceiptButton({ tripId, currencies }: { tripId: string; currencies: string[] }) {
  const pick = useRef<HTMLInputElement>(null), [note, setNote] = useState<{ text: string; ai?: boolean } | null>(null);
  const read = async (file?: File) => {
    const form = pick.current?.form;
    if (!file || !form) return;
    setNote({ text: sv.aiRead.receiptBusy });
    const photo = await import("./photo.ts").then((m) => m.shrinkPhoto(file)).catch(() => null);
    if (!photo) { setNote({ text: sv.aiRead.badPhoto }); return; }
    const r = await api.receipt(tripId, photo);
    if (pick.current) pick.current.value = "";
    if (!r.ok) { setNote({ text: aiErrorText(r) }); return; }
    const f = receiptFill(r.reading, currencies);
    if (!Object.keys(f).length) { setNote({ text: sv.aiRead.receiptNothing }); return; }
    const set = (name: string, v?: string) => { const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null; if (v && el && "value" in el) el.value = v; };
    set("amount", f.amount); set("currency", f.currency); set("text", f.text); set("date", f.date);
    const tile = f.category && form.querySelector<HTMLInputElement>(`input[name="category"][value="${CSS.escape(f.category)}"]`);
    if (tile) tile.click(); // through the tiles' own handler, so their state follows
    setNote({ text: sv.aiRead.receiptDone, ai: true });
  };
  return <div className="receipt">
    <input ref={pick} type="file" hidden accept="image/*" capture="environment" onChange={(e) => read(e.target.files?.[0])} />
    <input type="hidden" name="date" />
    <IconButton icon="camera" tip="right" label={sv.aiRead.receipt} onClick={() => pick.current?.click()} />
    {note && <p className="ro note" role="status">{note.ai && <AiMark />}{note.text}</p>}
  </div>;
}
