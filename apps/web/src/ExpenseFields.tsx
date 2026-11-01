// The activity an expense applies to and its category tiles, which follow each other (UP-42, UP-47, MI-41).
import { useState, type ReactNode } from "react";
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
    <ActivityAndCategory choices={choices} activity={guess} label={sv.up.wishes} name="dream" onChange={(v) => setActivity(v.activity)} />
    <label>{chosen ? sv.up.shortText : sv.up.what}<input name="text" maxLength={60} placeholder={chosen ? chosen.text : sv.up.whatExample} /></label>
    <div className="two">
      <label>{sv.amount.replace(" (kr)", "")}<input name="amount" inputMode="decimal" /></label>
      {currency}
    </div>
    {payer}
  </>;
}
