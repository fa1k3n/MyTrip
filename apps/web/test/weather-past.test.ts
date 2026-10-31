import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastUrl, pastDays } from "../src/weather.ts";

// REQ: WX-16 past trip days get their weather: past_days reaches back to the earliest trip day, at most 92 days
test("WX-16 pastDays and forecastUrl", () => {
  assert.equal(pastDays(["2026-10-31", "2026-10-26", "2026-10-28"], "2026-10-31"), 5);
  assert.equal(pastDays(["2026-11-02"], "2026-10-31"), 0); // not yet started
  assert.equal(pastDays(["2026-01-01"], "2026-10-31"), 92);
  assert.equal(pastDays([], "2026-10-31"), 0);
  const p = [{ lat: 55.38, lon: 13.16 }];
  assert.equal(new URL(forecastUrl(p, 5)).searchParams.get("past_days"), "5");
  assert.equal(new URL(forecastUrl(p)).searchParams.get("past_days"), null);
  assert.equal(new URL(forecastUrl(p, 0)).searchParams.get("past_days"), null);
});
