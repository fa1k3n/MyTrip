import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { fileStore } from "./file-store.ts";

// One file per trip: <dir>/<id>.trip.json. Cover images live in <dir>/img/.
const dir = process.env.TRIP_DIR ?? fileURLToPath(new URL("../../../data/", import.meta.url));
const tokens = { read: process.env.TRIP_READ_TOKEN ?? "", propose: process.env.TRIP_PROPOSE_TOKEN ?? "", admin: process.env.TRIP_ADMIN_TOKEN ?? "" };
if (!tokens.admin) throw new Error("Set TRIP_ADMIN_TOKEN (and TRIP_READ_TOKEN, TRIP_PROPOSE_TOKEN)");

const store = fileStore(dir);

// AI_API_KEY is only checked for presence here; it never leaves the server (AI-03, MC-13).
// ROUTES_API_KEY (Google Routes API) turns on the traffic check; TRAFFIC_DELAY_MIN is the warning threshold (TR-15, TR-17).
const trafficThresholdMin = Number(process.env.TRAFFIC_DELAY_MIN ?? 10);
// ADMIN_PASSWORD and SESSION_KEY turn on the admin login (AU-04); without them the dev token is the only admin access.
const auth = { adminPassword: process.env.ADMIN_PASSWORD, sessionKey: process.env.SESSION_KEY };
serve({ fetch: createApp(store, tokens, { aiService: !!process.env.AI_API_KEY, routesKey: process.env.ROUTES_API_KEY, trafficThresholdMin, auth, vapidKey: process.env.VAPID_KEY }).fetch, port: Number(process.env.PORT ?? 8787) });
console.log(`API on http://localhost:${process.env.PORT ?? 8787}, trips in ${dir}`);
