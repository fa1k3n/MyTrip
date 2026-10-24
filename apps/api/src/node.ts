import { serve } from "@hono/node-server";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Trip } from "@trip/schema";
import { createApp, type Store } from "./app.ts";

// One file per trip: <dir>/<id>.trip.json. Cover images live in <dir>/img/.
const dir = process.env.TRIP_DIR ?? fileURLToPath(new URL("../../../data/", import.meta.url));
const tokens = { read: process.env.TRIP_READ_TOKEN ?? "", propose: process.env.TRIP_PROPOSE_TOKEN ?? "", admin: process.env.TRIP_ADMIN_TOKEN ?? "" };
if (!tokens.admin) throw new Error("Set TRIP_ADMIN_TOKEN (and TRIP_READ_TOKEN, TRIP_PROPOSE_TOKEN)");

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
};

serve({ fetch: createApp(store, tokens).fetch, port: Number(process.env.PORT ?? 8787) });
console.log(`API on http://localhost:${process.env.PORT ?? 8787}, trips in ${dir}`);
