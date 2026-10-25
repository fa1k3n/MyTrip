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

type Act = { id: string; text: string; hiddenFrom?: string[] };

/** Whom each activity of a day is hidden from, its own choice plus that of every similar hidden activity. Activities hidden
 * from no one are left out. */
export function hiddenFromIn(day: { activities: Act[] }): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const hidden = day.activities.filter((h) => h.hiddenFrom?.length);
  if (!hidden.length) return out;
  for (const a of day.activities) {
    const who = [...(a.hiddenFrom ?? [])];
    for (const h of hidden) if (h !== a && similarTitles(h.text, a.text)) who.push(...h.hiddenFrom!.filter((id) => !who.includes(id)));
    if (who.length) out.set(a.id, who);
  }
  return out;
}
