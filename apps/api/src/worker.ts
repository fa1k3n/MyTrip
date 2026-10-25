// The Cloudflare Worker: the API under /api, the built web files for everything else (DP-01, DP-07).
// Cover images are in D1 unless an R2 bucket is bound as IMAGES (DP-05).
// The Worker configuration (wrangler.jsonc) lives in the private repository; it serves the web files and sends /api/* here first.
import { createApp } from "./app.ts";
import { d1Store, type D1Like, type R2Like } from "./d1-store.ts";

export type WorkerEnv = {
  DB: D1Like; IMAGES?: R2Like; ASSETS?: { fetch(r: Request): Promise<Response> };
  // Secrets (wrangler secret put …), never in the configuration or a repository (DP-07).
  TRIP_READ_TOKEN?: string; TRIP_PROPOSE_TOKEN?: string; TRIP_ADMIN_TOKEN?: string;
  ADMIN_PASSWORD?: string; SESSION_KEY?: string; ROUTES_API_KEY?: string; AI_API_KEY?: string;
  VAPID_KEY?: string; // the private VAPID key as a JWK, for notices (NT-05)
  TRAFFIC_DELAY_MIN?: string;
};

// One app per set of bindings, kept while the Worker instance lives; state that must last is in D1.
const apps = new WeakMap<WorkerEnv, ReturnType<typeof createApp>>();
const appFor = (env: WorkerEnv) => {
  let app = apps.get(env);
  if (!app) {
    const tokens = { read: env.TRIP_READ_TOKEN ?? "", propose: env.TRIP_PROPOSE_TOKEN ?? "", admin: env.TRIP_ADMIN_TOKEN ?? "" };
    app = createApp(d1Store(env.DB, env.IMAGES), tokens, {
      aiService: !!env.AI_API_KEY, routesKey: env.ROUTES_API_KEY, trafficThresholdMin: Number(env.TRAFFIC_DELAY_MIN ?? 10),
      auth: { adminPassword: env.ADMIN_PASSWORD, sessionKey: env.SESSION_KEY }, vapidKey: env.VAPID_KEY,
    });
    apps.set(env, app);
  }
  return app;
};

export default {
  fetch(req: Request, env: WorkerEnv, ctx?: Parameters<ReturnType<typeof createApp>["fetch"]>[2]): Promise<Response> | Response {
    if (new URL(req.url).pathname.startsWith("/api/")) return appFor(env).fetch(req, env, ctx); // ctx keeps notices going after the answer (NT-05)
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
  },
};
