// Currencies of expenses: the country of a day, its currency and exchange rates (UP-23..UP-26).
import { money } from "./budget.ts";
import { kr } from "./format.ts";

const EURO = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
const CURRENCY: Record<string, string> = {
  ...Object.fromEntries(EURO.map((c) => [c, "EUR"])),
  SE: "SEK", DK: "DKK", NO: "NOK", IS: "ISK", GB: "GBP", CH: "CHF", PL: "PLN", CZ: "CZK", HU: "HUF", US: "USD",
};

/** The currency of a country, else the trip's (UP-23). */
export const currencyFor = (country: string | undefined, tripCurrency: string) => (country && CURRENCY[country]) || tripCurrency;

/** The country code in a place lookup from Open-Meteo (UP-24). */
export function parseCountry(json: unknown): string | undefined {
  const c = (json as { results?: { country_code?: string }[] })?.results?.[0]?.country_code;
  return c ? c.toUpperCase() : undefined;
}

/** The day's own country, else the one looked up on this device for its location (UP-24). */
export const dayCountry = (d: { location?: string; country?: string }, kept: Record<string, string>) =>
  d.country ?? (d.location ? kept[d.location] : undefined);

/** ECB rates via Frankfurter: free, no key. A date without a rate (weekend) gives the latest before it (UP-25). */
export const rateUrl = (from: string, to: string, date: string) => `https://api.frankfurter.dev/v1/${date}?from=${from}&to=${to}`;

export function parseRate(json: unknown, to: string): { rate: number; date: string } | null {
  const j = json as { date?: string; rates?: Record<string, number> } | null;
  const rate = j?.rates?.[to];
  return typeof rate === "number" && rate > 0 && j?.date ? { rate, date: j.date } : null;
}

/** "28,50 € (320,06 kr)": the amount as paid, then in the trip's currency (UP-26). */
export function expenseAmountText(e: { amount: number; foreign?: { amount: number; currency: string; rate?: number; rateDate?: string } }, tripCurrency: string) {
  const home = tripCurrency === "SEK" ? kr(e.amount) : money(e.amount, tripCurrency);
  return e.foreign ? `${money(e.foreign.amount, e.foreign.currency)} (${home})` : home;
}

// What the device keeps, so that the form works without a network (UP-24, UP-25).
const COUNTRIES = "mytrip.countries", RATES = "mytrip.rates";
const load = <T,>(key: string): Record<string, T> => { try { return JSON.parse(localStorage.getItem(key) ?? "{}") ?? {}; } catch { return {}; } };
const keep = <T,>(key: string, k: string, v: T) => { try { localStorage.setItem(key, JSON.stringify({ ...load<T>(key), [k]: v })); } catch { /* private mode */ } };

export const keptCountries = () => load<string>(COUNTRIES);

/** Looks up and keeps the country of a location; undefined when it cannot be found. */
export async function lookupCountry(location: string, url: string) {
  const c = await fetch(url).then((r) => (r.ok ? r.json() : null)).then(parseCountry, () => undefined);
  if (c) keep(COUNTRIES, location, c);
  return c;
}

/** The rate of the date, fetched and kept; without a network the latest kept rate for the pair, or null. */
export async function rateFor(from: string, to: string, date: string) {
  const fresh = await fetch(rateUrl(from, to, date)).then((r) => (r.ok ? r.json() : null)).then((j) => parseRate(j, to), () => null);
  if (fresh) keep(RATES, `${from}-${to}`, fresh);
  return fresh ?? load<{ rate: number; date: string }>(RATES)[`${from}-${to}`] ?? null;
}
