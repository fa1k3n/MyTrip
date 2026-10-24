import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastRows, forecastUrl, parseForecast, weatherSymbol } from "../src/weather.ts";

// REQ: WX-10 the symbol distinguishes the main weather groups
test("WX-10 weatherSymbol", () => {
  const codes = [0, 2, 3, 45, 51, 61, 71, 95];
  const symbols = codes.map(weatherSymbol);
  assert.equal(new Set(symbols).size, codes.length);
  assert.equal(weatherSymbol(3), "☁️");
  assert.equal(weatherSymbol(0), "☀️");
});

// REQ: WX-03 WX-12 three rows: condition with rain chance, temperature, wind, with Swedish decimals
test("WX-03 WX-12 forecastRows", () => {
  assert.deepEqual(forecastRows({ code: 3, rain: 20, tMax: 11.4, wind: 5.2 }), ["Mulet, 20 % regn", "11 °C", "5 m/s"]);
  assert.deepEqual(forecastRows({ code: 80, rain: 60, tMax: 9, wind: 6 }), ["Skurar, 60 % regn", "9 °C", "6 m/s"]);
});

// REQ: PF-03 one request covers every location
test("PF-03 forecastUrl uses one request for all points", () => {
  const url = new URL(forecastUrl([{ lat: 55.68, lon: 12.57 }, { lat: 52.52, lon: 13.4 }]));
  assert.equal(url.searchParams.get("latitude"), "55.68,52.52");
  assert.equal(url.searchParams.get("longitude"), "12.57,13.4");
  assert.equal(url.searchParams.get("wind_speed_unit"), "ms");
});

// REQ: WX-14 dates outside the forecast are missing, not guessed
test("WX-14 parseForecast", () => {
  const one = { daily: { time: ["2026-10-24"], weather_code: [3], precipitation_probability_max: [20], temperature_2m_max: [11], wind_speed_10m_max: [5] } };
  const out = parseForecast([one, one]);
  assert.deepEqual(out[1]["2026-10-24"], { code: 3, rain: 20, tMax: 11, wind: 5 });
  assert.equal(out[0]["2026-10-30"], undefined);
  assert.deepEqual(parseForecast(one).length, 1);
  assert.deepEqual(parseForecast({ error: true }), []);
});
