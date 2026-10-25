import { serve } from "@hono/node-server";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Settings, Trip } from "@trip/schema";
import { createApp, type Store } from "./app.ts";

// One file per trip: <dir>/<id>.trip.json. Cover images live in <dir>/img/.
const dir = process.env.TRIP_DIR ?? fileURLToPath(new URL("../../../data/", import.meta.url));
const tokens = { read: process.env.TRIP_READ_TOKEN ?? "", propose: process.env.TRIP_PROPOSE_TOKEN ?? "", admin: process.env.TRIP_ADMIN_TOKEN ?? "" };
if (!tokens.admin) throw new Error("Set TRIP_ADMIN_TOKEN (and TRIP_READ_TOKEN, TRIP_PROPOSE_TOKEN)");

const settingsFile = join(dir, "settings.json");
const isId = (id: string) => /^[a-z0-9][a-z0-9-]*$/.test(id);
const file = (id: string) => join(dir, `${id}.trip.json`);
const missing = (e: unknown) => (e as { code?: string }).code === "ENOENT";

const store: Store = {
  async list() {
    const names = (await readdir(dir)).filter((n) => n.endsWith(".trip.json")).sort();
    return (await Promise.all(names.map((n) => store.load(n.slice(0, -".trip.json".length))))).filter((t) => t !== undefined);
  },
  async load(id) {
    if (!isId(id)) return undefined;
    try {
      return Trip.parse({ ...JSON.parse(await readFile(file(id), "utf8")), id });
    } catch (e) {
      if (missing(e)) return undefined;
      throw e;
    }
  },
  save: (t) => writeFile(file(t.id), JSON.stringify(t, null, 2) + "\n"),
  async remove(id) {
    if (!isId(id) || !(await store.load(id))) return false;
    await rm(file(id));
    return true;
  },
  async image(name) {
    try {
      return new Uint8Array(await readFile(join(dir, "img", name))); // name is checked by the schema
    } catch (e) {
      if (missing(e)) return undefined;
      throw e;
    }
  },
  async loadSettings() {
    try {
      return Settings.parse(JSON.parse(await readFile(settingsFile, "utf8")));
    } catch (e) {
      if (missing(e)) return Settings.parse({});
      throw e;
    }
  },
  saveSettings: (s) => writeFile(settingsFile, JSON.stringify(s, null, 2) + "\n"),
};

// AI_API_KEY is only checked for presence here; it never leaves the server (AI-03, MC-13).
// ROUTES_API_KEY (Google Routes API) turns on the traffic check; TRAFFIC_DELAY_MIN is the warning threshold (TR-15, TR-17).
const trafficThresholdMin = Number(process.env.TRAFFIC_DELAY_MIN ?? 10);
serve({ fetch: createApp(store, tokens, { aiService: !!process.env.AI_API_KEY, routesKey: process.env.ROUTES_API_KEY, trafficThresholdMin }).fetch, port: Number(process.env.PORT ?? 8787) });
console.log(`API on http://localhost:${process.env.PORT ?? 8787}, trips in ${dir}`);
