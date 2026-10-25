import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastUrl, parseForecast, wxLabel, wxRows } from "../src/weather.ts";

const f = { code: 61, rain: 60, tMax: 17.4, wind: 3.2, tMin: 8.6, precip: 0.44 };

// REQ: WX-03 WX-04 WX-05 WX-06 WX-07 WX-12 three rows of symbol and value, no words and no drop symbol
test("WX-03 WX-04 WX-05 WX-06 WX-07 WX-12 wxRows", () => {
  assert.deepEqual(wxRows(f), [["🌧️", "0,4 mm"], ["🌡️", "9/17°"], ["💨", "3"]]);
  assert.deepEqual(wxRows({ ...f, precip: 12.6 })[0], ["🌧️", "13 mm"]);
  assert.ok(!wxRows(f).flat().join("").includes("💧"));
});

// REQ: WX-14 DQ-03 without a minimum temperature only the known value is shown
test("WX-14 DQ-03 wxRows without tMin or precipitation", () => {
  assert.deepEqual(wxRows({ code: 3, rain: 20, tMax: 11, wind: 5 }), [["☁️", "20 %"], ["🌡️", "11°"], ["💨", "5"]]);
});

// REQ: WX-13 a full-text description with units
test("WX-13 wxLabel", () => {
  assert.equal(wxLabel(f), "Väder: 9 till 17 °C, 0,4 mm nederbörd, vind 3 m/s");
});

// REQ: WX-04 WX-05 the forecast asks for minimum temperature and precipitation, and they are parsed when present
test("WX-04 WX-05 forecastUrl and parseForecast extras", () => {
  const daily = new URL(forecastUrl([{ lat: 1, lon: 2 }])).searchParams.get("daily")!;
  assert.ok(daily.includes("temperature_2m_min") && daily.includes("precipitation_sum"));
  const one = { daily: { time: ["2026-10-27"], weather_code: [61], precipitation_probability_max: [60], temperature_2m_max: [17.4], wind_speed_10m_max: [3.2], temperature_2m_min: [8.6], precipitation_sum: [0.44] } };
  assert.deepEqual(parseForecast(one)[0]["2026-10-27"], f);
});
