// Daily forecast from Open-Meteo (no key, attribution required: WX-15).
export type Forecast = { code: number; rain: number; tMax: number; wind: number };
type Daily = { time: string[]; weather_code: number[]; precipitation_probability_max: number[]; temperature_2m_max: number[]; wind_speed_10m_max: number[] };

const groups: [number[], string, string][] = [
  [[0], "☀️", "Sol"], [[1, 2], "⛅", "Halvklart"], [[3], "☁️", "Mulet"], [[45, 48], "🌫️", "Dimma"],
  [[51, 53, 55, 56, 57], "🌦️", "Duggregn"], [[61, 63, 65, 66, 67], "🌧️", "Regn"], [[80, 81, 82], "🌧️", "Skurar"],
  [[71, 73, 75, 77, 85, 86], "🌨️", "Snö"], [[95, 96, 99], "⛈️", "Åska"],
];
const group = (code: number) => groups.find(([codes]) => codes.includes(code)) ?? groups[2];

export const weatherSymbol = (code: number) => group(code)[1];

const n = (x: number) => Math.round(x).toLocaleString("sv-SE");
export const forecastRows = (f: Forecast) => [`${group(f.code)[2]}, ${n(f.rain)} % regn`, `${n(f.tMax)} °C`, `${n(f.wind)} m/s`];

export function forecastUrl(points: { lat: number; lon: number }[]) {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", points.map((p) => p.lat).join(","));
  u.searchParams.set("longitude", points.map((p) => p.lon).join(","));
  u.searchParams.set("daily", "weather_code,precipitation_probability_max,temperature_2m_max,wind_speed_10m_max");
  u.searchParams.set("wind_speed_unit", "ms");
  u.searchParams.set("timezone", "auto");
  u.searchParams.set("forecast_days", "16");
  return u.toString();
}

/** One date -> forecast map per requested point. Dates outside the forecast are simply absent (WX-14). */
export function parseForecast(json: unknown): Record<string, Forecast>[] {
  const list = (Array.isArray(json) ? json : [json]) as { daily?: Daily }[];
  if (!list.every((x) => x?.daily)) return [];
  return list.map(({ daily: d }) =>
    Object.fromEntries(d!.time.map((date, i) => [date, { code: d!.weather_code[i], rain: d!.precipitation_probability_max[i], tMax: d!.temperature_2m_max[i], wind: d!.wind_speed_10m_max[i] }])
      .filter(([, f]) => Object.values(f as Forecast).every((v) => typeof v === "number"))));
}

/** Place search of the same provider, used to give a new day its forecast location (ED-04). */
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

/** null when the place is unknown or the provider cannot be reached. */
export const geocode = (name: string) =>
  fetch(geocodeUrl(name)).then((r) => (r.ok ? r.json() : null)).then(parseGeocode, () => null);
