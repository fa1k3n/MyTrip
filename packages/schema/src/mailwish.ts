// A mail to a trip's wish address becomes a wish (DB-23): read without AI, from the subject, the text and the HTML part.
import { FORWARD_PREFIX, htmlText } from "./mailbooking.ts";

export type WishReading = { title?: string; url?: string; category: string };

const LINK = /https?:\/\/[^\s<>"'()[\]]+/i;
/** Words that point to a category, tried in this order; parts of words count, since Swedish joins words ("loppmarknad"). */
const GUESS: [string, RegExp][] = [
  ["Museum", /museum|museet|museer|utställning|galleri|gallery/],
  ["Mat", /restaurang|restaurant|café|kafé|cafe|pizz|bageri|konditori|glass|krog|bistro|middag|lunch|frukost|fika|(^|[^\p{L}])mat([^\p{L}]|$)/u],
  ["Bad", /bad|strand|beach|pool|simhall|therme|aquapark/],
  ["Avkoppling", /(^|[^\p{L}])spa([^\p{L}]|$)|massage|bastu|sauna|wellness|avkoppling/u],
  ["Shopping", /shop|butik|marknad|köpcentrum|outlet|loppis|affär/],
  ["Utsikt", /utsikt|torn|tower|panorama/],
  ["Aktivitet", /klätter|äventyr|nöjespark|tivoli|zoo|djurpark|lekland|bowling/],
  ["Natur", /natur|park|skog|sjö|vandring|hike|hiking|fjäll|vattenfall/],
];

/** The first http or https link, without trailing punctuation; from the text, otherwise from a link in the HTML part. */
function firstLink(text: string, html: string): string | undefined {
  const raw = LINK.exec(text)?.[0] ?? /href\s*=\s*["'](https?:\/\/[^"']+)["']/i.exec(html)?.[1];
  const u = raw?.replace(/[.,;:!?]+$/, "");
  try { return u && /^https?:$/.test(new URL(u).protocol) ? u : undefined; } catch { return undefined; }
}

/** The wish a mail describes (DB-23); without a title it cannot become one. */
export function readWish(mail: { subject?: string; text?: string; html?: string }): WishReading {
  const html = mail.html ?? "", text = [mail.text ?? "", html ? htmlText(html) : ""].join("\n");
  const subject = (mail.subject ?? "").replace(FORWARD_PREFIX, "").trim();
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && l.replace(LINK, "").trim());
  const title = (subject || line)?.slice(0, 120), url = firstLink(text, html);
  const words = `${title ?? ""}\n${text}`.replace(new RegExp(LINK.source, "gi"), " ").toLowerCase();
  const category = GUESS.find(([, re]) => re.test(words))?.[0] ?? "Aktivitet";
  return { ...(title ? { title } : {}), ...(url ? { url } : {}), category };
}
