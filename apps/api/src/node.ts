import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { fileStore } from "./file-store.ts";
import { googleOf } from "./users.ts";
import { anthropicCall, CLOCK_DELAY_MS } from "./ai.ts";

// One file per trip: <dir>/<id>.trip.json. Cover images live in <dir>/img/.
const dir = process.env.TRIP_DIR ?? fileURLToPath(new URL("../../../data/", import.meta.url));
const tokens = { read: process.env.TRIP_READ_TOKEN ?? "", propose: process.env.TRIP_PROPOSE_TOKEN ?? "", admin: process.env.TRIP_ADMIN_TOKEN ?? "" };
if (!tokens.admin) throw new Error("Set TRIP_ADMIN_TOKEN (and TRIP_READ_TOKEN, TRIP_PROPOSE_TOKEN)");

const store = fileStore(dir);

// AI_API_KEY or the gateway token call the AI service from the server; they never leave it (AI-03, MC-13).
// ROUTES_API_KEY (Google Routes API) turns on the traffic check; TRAFFIC_DELAY_MIN is the warning threshold (TR-15, TR-17).
const trafficThresholdMin = Number(process.env.TRAFFIC_DELAY_MIN ?? 10);
// ADMIN_PASSWORD and SESSION_KEY turn on the admin login (AU-04); without them the dev token is the only admin access.
// GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET turn on Google login for accounts (US-10).
const auth = { adminPassword: process.env.ADMIN_PASSWORD, sessionKey: process.env.SESSION_KEY, google: googleOf(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET) };
// AI-73: through Cloudflare AI Gateway when AI_GATEWAY_URL and AI_GATEWAY_TOKEN are set, else with AI_API_KEY.
const ai = process.env.AI_GATEWAY_URL && process.env.AI_GATEWAY_TOKEN ? anthropicCall({ gateway: { url: process.env.AI_GATEWAY_URL, token: process.env.AI_GATEWAY_TOKEN } })
  : process.env.AI_API_KEY ? anthropicCall({ apiKey: process.env.AI_API_KEY }) : undefined;
// AI-69: a timer per trip in this process, moved ahead by each change (the Worker uses a Durable Object).
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const onChange = async (id: string) => {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => { timers.delete(id); void app.aiTick(id).catch(() => {}); }, CLOCK_DELAY_MS).unref());
};
const app = createApp(store, tokens, { aiService: !!ai, ...(ai ? { ai: { call: ai } } : {}), onChange, routesKey: process.env.ROUTES_API_KEY, trafficThresholdMin, auth, vapidKey: process.env.VAPID_KEY, inboxDomain: process.env.INBOX_DOMAIN });
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) });
console.log(`API on http://localhost:${process.env.PORT ?? 8787}, trips in ${dir}`);
