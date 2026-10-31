// Daily forecast from Open-Meteo (no key, attribution required: WX-15).
export type Forecast = { code: number; rain: number; tMax: number; wind: number; tMin?: number; precip?: number };
type Daily = {
  time: string[]; weather_code: number[]; precipitation_probability_max: number[]; temperature_2m_max: number[]; wind_speed_10m_max: number[];
  temperature_2m_min?: number[]; precipitation_sum?: number[];
};

const groups: [number[], string, string][] = [
  [[0], "☀️", "Sol"], [[1, 2], "⛅", "Halvklart"], [[3], "☁️", "Mulet"], [[45, 48], "🌫️", "Dimma"],
  [[51, 53, 55, 56, 57], "🌦️", "Duggregn"], [[61, 63, 65, 66, 67], "🌧️", "Regn"], [[80, 81, 82], "🌧️", "Skurar"],
  [[71, 73, 75, 77, 85, 86], "🌨️", "Snö"], [[95, 96, 99], "⛈️", "Åska"],
];
const group = (code: number) => groups.find(([codes]) => codes.includes(code)) ?? groups[2];

export const weatherSymbol = (code: number) => group(code)[1];

const n = (x: number) => Math.round(x).toLocaleString("sv-SE");
export const forecastRows = (f: Forecast) => [`${group(f.code)[2]}, ${n(f.rain)} % regn`, `${n(f.tMax)} °C`, `${n(f.wind)} m/s`];

/** Days back to the earliest trip day, at most 92 (the provider's limit), so past trip days keep their weather (WX-16). */
export function pastDays(dates: string[], today: string) {
  const first = [...dates].sort()[0];
  if (!first || first >= today) return 0;
  return Math.min(92, Math.round((Date.parse(today) - Date.parse(first)) / 86_400_000));
}

export function forecastUrl(points: { lat: number; lon: number }[], past = 0) {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", points.map((p) => p.lat).join(","));
  u.searchParams.set("longitude", points.map((p) => p.lon).join(","));
  u.searchParams.set("daily", "weather_code,precipitation_probability_max,temperature_2m_max,wind_speed_10m_max,temperature_2m_min,precipitation_sum");
  u.searchParams.set("wind_speed_unit", "ms");
  u.searchParams.set("timezone", "auto");
  u.searchParams.set("forecast_days", "16");
  if (past > 0) u.searchParams.set("past_days", String(past)); // WX-16
  return u.toString();
}

/** One date -> forecast map per requested point. Dates outside the forecast are simply absent (WX-14). */
export function parseForecast(json: unknown): Record<string, Forecast>[] {
  const list = (Array.isArray(json) ? json : [json]) as { daily?: Daily }[];
  if (!list.every((x) => x?.daily)) return [];
  const isNum = (v: unknown): v is number => typeof v === "number";
  return list.map(({ daily: d }) =>
    Object.fromEntries(d!.time.map((date, i) => {
      const f: Forecast = { code: d!.weather_code[i], rain: d!.precipitation_probability_max[i], tMax: d!.temperature_2m_max[i], wind: d!.wind_speed_10m_max[i] };
      if (isNum(d!.temperature_2m_min?.[i])) f.tMin = d!.temperature_2m_min![i];
      if (isNum(d!.precipitation_sum?.[i])) f.precip = d!.precipitation_sum![i];
      return [date, f] as const;
    }).filter(([, f]) => [f.code, f.rain, f.tMax, f.wind].every(isNum))));
}

/** Precipitation with one decimal below 10 mm, as on the original page (WX-04, WX-12). */
const mm = (x: number) => (x < 10 ? (Math.round(x * 10) / 10).toLocaleString("sv-SE") : n(x)) + " mm";

/** Three rows of [symbol, value] without words (WX-03..WX-07). Missing values are left out, not guessed (DQ-03). */
export function wxRows(f: Forecast): [string, string][] {
  return [
    [weatherSymbol(f.code), f.precip !== undefined ? mm(f.precip) : `${n(f.rain)} %`],
    ["🌡️", f.tMin !== undefined ? `${n(f.tMin)}/${n(f.tMax)}°` : `${n(f.tMax)}°`],
    ["💨", n(f.wind)],
  ];
}

/** Full text with units, for the tooltip and screen readers (WX-13). */
export const wxLabel = (f: Forecast) =>
  `Väder: ${f.tMin !== undefined ? `${n(f.tMin)} till ${n(f.tMax)}` : n(f.tMax)} °C, ` +
  `${f.precip !== undefined ? `${mm(f.precip)} nederbörd` : `${n(f.rain)} % risk för regn`}, vind ${n(f.wind)} m/s`;

/** Place search of the same provider, used to give a new day its forecast location (ED-04). */
import { parseCountry } from "./currency.ts";

export function geocodeUrl(name: string) {
  const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
  u.searchParams.set("name", name);
  u.searchParams.set("count", "1");
  u.searchParams.set("language", "sv");
  u.searchParams.set("format", "json");
  return u.toString();
}

export function parseGeocode(json: unknown): { lat: number; lon: number } | null {
  const r = (json as { results?: { latitude: number; longitude: number }[] })?.results?.[0];
  return r ? { lat: Math.round(r.latitude * 100) / 100, lon: Math.round(r.longitude * 100) / 100 } : null;
}

/** Coordinates and country from one lookup (ED-04, UP-24); null when the provider cannot be reached. */
export const lookupPlace = (name: string) =>
  fetch(geocodeUrl(name)).then((r) => (r.ok ? r.json() : null)).then((j) => ({ weather: parseGeocode(j), country: parseCountry(j) ?? null }), () => null);

/** null when the place is unknown or the provider cannot be reached. */
export const geocode = (name: string) =>
  fetch(geocodeUrl(name)).then((r) => (r.ok ? r.json() : null)).then(parseGeocode, () => null);
