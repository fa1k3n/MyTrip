/** Hiding by resemblance (AU-24): an activity whose title resembles a hidden one on the same day is hidden from the same
 * travelers, so "Bil till Liseberg" does not give away a hidden "Liseberg". */

/** Short and generic words that say nothing about what is hidden. */
const COMMON = new Set(("och med till fran for vid mot hos utan efter innan inne ute hem den det des som the and " +
  "bil buss tag flyg flyget bat farja taxi tunnelbana promenad promenera aka resa kora frukost lunch middag fika mat " +
  "hotell hotellet boende incheckning utcheckning packa vila dag kvall morgon").split(" "));

/** The significant words of a title: lower case, without accents and punctuation. */
function words(title: string): string[] {
  return title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !COMMON.has(w));
}

const same = (a: string, b: string) => a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b));

/** True when the titles share a significant word; a word of four letters or more also matches a longer one it starts. */
export function similarTitles(a: string, b: string): boolean {
  const wb = words(b);
  return words(a).some((x) => wb.some((y) => same(x, y)));
}

type Act = { id: string; text: string; note?: string; hiddenFrom?: string[] };

/** Whom each activity of a day is hidden from, its own choice plus that of every hidden activity its title or note resembles
 * (AU-24, AU-30). Activities hidden from no one are left out. */
export function hiddenFromIn(day: { activities: Act[] }): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const hidden = day.activities.filter((h) => h.hiddenFrom?.length);
  if (!hidden.length) return out;
  for (const a of day.activities) {
    const who = [...(a.hiddenFrom ?? [])];
    for (const h of hidden) if (h !== a && (similarTitles(h.text, a.text) || (!!a.note && similarTitles(h.text, a.note)))) who.push(...h.hiddenFrom!.filter((id) => !who.includes(id)));
    if (who.length) out.set(a.id, who);
  }
  return out;
}

/** Whom a text of the day, such as its title, is hidden from: everyone that a hidden activity it resembles is hidden from (AU-27). */
export function textHiddenFrom(day: { activities: Act[] }, text: string): string[] {
  const who = hiddenFromIn(day), out: string[] = [];
  for (const a of day.activities) if (who.has(a.id) && similarTitles(a.text, text)) out.push(...who.get(a.id)!.filter((id) => !out.includes(id)));
  return out;
}

/** An activity hidden by choice anywhere in the trip and whom it is hidden from (AU-30). */
export type Secret = { text: string; who: string[] };
export const secretsOf = (t: { days: { activities: Act[] }[] }): Secret[] =>
  t.days.flatMap((d) => d.activities.filter((a) => a.hiddenFrom?.length).map((a) => ({ text: a.text, who: a.hiddenFrom! })));

/** Whom texts are hidden from: everyone that a secret they resemble is hidden from (AU-30). An item that links a place passes
 * the place's name and notes among its texts. */
export function whoFor(secrets: Secret[], texts: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const s of secrets) if (texts.some((x) => !!x && similarTitles(s.text, x))) out.push(...s.who.filter((id) => !out.includes(id)));
  return out;
}
