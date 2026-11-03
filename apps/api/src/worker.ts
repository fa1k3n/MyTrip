// The Cloudflare Worker: the API under /api, the built web files for everything else (DP-01, DP-07).
// Cover images are in D1 unless an R2 bucket is bound as IMAGES (DP-05).
// The Worker configuration (wrangler.jsonc) lives in the private repository; it serves the web files and sends /api/* here first.
import { createApp } from "./app.ts";
import { d1Store, type D1Like, type R2Like } from "./d1-store.ts";
import { googleOf } from "./users.ts";
import { brevoMailer } from "./mailer.ts";
import { anthropicCall, CLOCK_DELAY_MS } from "./ai.ts";
// The entry module exports only handlers and Durable Object classes; the runtime rejects anything else.

export type WorkerEnv = {
  DB: D1Like; IMAGES?: R2Like; ASSETS?: { fetch(r: Request): Promise<Response> };
  // Secrets (wrangler secret put …), never in the configuration or a repository (DP-07).
  TRIP_READ_TOKEN?: string; TRIP_PROPOSE_TOKEN?: string; TRIP_ADMIN_TOKEN?: string;
  ADMIN_PASSWORD?: string; SESSION_KEY?: string; ROUTES_API_KEY?: string; AI_API_KEY?: string;
  AI_GATEWAY_TOKEN?: string; // Cloudflare AI Gateway with Unified Billing (AI-73); the gateway's address is AI_GATEWAY_URL
  AI_GATEWAY_URL?: string; // https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/anthropic
  AI_CLOCK?: ClockNamespace; // one timer per trip for the AI helpers (AI-69), the Durable Object AiClock
  GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; // Google login (US-10)
  VAPID_KEY?: string; // the private VAPID key as a JWK, for notices (NT-05)
  TRAFFIC_DELAY_MIN?: string;
  INBOX_DOMAIN?: string; // the domain whose mail Cloudflare Email Routing sends to this Worker (BK-14)
  BREVO_API_KEY?: string; MAIL_FROM?: string; APP_URL?: string; // mail for a forgotten password (US-35): the key a secret, the rest vars
};
/** The parts of a Durable Object namespace and state the timer uses. */
type ClockNamespace = { idFromName(name: string): unknown; get(id: unknown): { fetch(r: Request | string, init?: RequestInit): Promise<Response> } };
type ClockState = { storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void>; setAlarm(at: number): Promise<void> } };
/** The parts of an incoming mail the Worker uses (Cloudflare Email Routing). */
export type IncomingMail = { to: string; raw: ReadableStream; setReject(reason: string): void };

/** What the sender's mail server is told when a mail is rejected. */
export const REJECT = {
  "unknown address": "Unknown address", "too many": "Too many mails for this trip right now",
  "no title": "The mail needs a subject", invalid: "The mail could not be added",
  duplicate: "This wish is already on the trip", // DB-27
};

/** The mail service when its key, sender and the app's address are set (US-35). */
const mailOf = (env: WorkerEnv) => (env.BREVO_API_KEY && env.MAIL_FROM && env.APP_URL ? { ...brevoMailer({ apiKey: env.BREVO_API_KEY, from: env.MAIL_FROM }), appUrl: env.APP_URL } : undefined);

/** The AI service: through the gateway when it is configured (AI-73), else with an Anthropic key (AI-03). */
const aiOf = (env: WorkerEnv) => (env.AI_GATEWAY_URL && env.AI_GATEWAY_TOKEN ? anthropicCall({ gateway: { url: env.AI_GATEWAY_URL, token: env.AI_GATEWAY_TOKEN } })
  : env.AI_API_KEY ? anthropicCall({ apiKey: env.AI_API_KEY }) : undefined);

// One app per set of bindings, kept while the Worker instance lives; state that must last is in D1.
const apps = new WeakMap<WorkerEnv, ReturnType<typeof createApp>>();
const appFor = (env: WorkerEnv) => {
  let app = apps.get(env);
  if (!app) {
    const tokens = { read: env.TRIP_READ_TOKEN ?? "", propose: env.TRIP_PROPOSE_TOKEN ?? "", admin: env.TRIP_ADMIN_TOKEN ?? "" };
    app = createApp(d1Store(env.DB, env.IMAGES), tokens, {
      aiService: !!aiOf(env), ...(aiOf(env) ? { ai: { call: aiOf(env)! } } : {}), routesKey: env.ROUTES_API_KEY, trafficThresholdMin: Number(env.TRAFFIC_DELAY_MIN ?? 10),
      auth: { adminPassword: env.ADMIN_PASSWORD, sessionKey: env.SESSION_KEY, google: googleOf(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET) }, vapidKey: env.VAPID_KEY, inboxDomain: env.INBOX_DOMAIN, mail: mailOf(env),
      onChange: env.AI_CLOCK ? async (id) => { // AI-69: move the trip's timer
        const ns = env.AI_CLOCK!;
        await ns.get(ns.idFromName(id)).fetch(`https://clock/${encodeURIComponent(id)}`, { method: "POST" });
      } : undefined,
    });
    apps.set(env, app);
  }
  return app;
};

/** One per trip: each change moves the alarm ahead, and the alarm runs the trip's AI helpers (AI-69). */
export class AiClock {
  state: ClockState; env: WorkerEnv;
  constructor(state: ClockState, env: WorkerEnv) { this.state = state; this.env = env; }
  async fetch(req: Request): Promise<Response> {
    await this.state.storage.put("trip", decodeURIComponent(new URL(req.url).pathname.slice(1)));
    await this.state.storage.setAlarm(Date.now() + CLOCK_DELAY_MS);
    return new Response(null, { status: 204 });
  }
  async alarm(): Promise<void> {
    const id = await this.state.storage.get<string>("trip");
    if (id) await appFor(this.env).aiTick(id);
  }
}

export default {
  fetch(req: Request, env: WorkerEnv, ctx?: Parameters<ReturnType<typeof createApp>["fetch"]>[2]): Promise<Response> | Response {
    if (new URL(req.url).pathname.startsWith("/api/")) return appFor(env).fetch(req, env, ctx); // ctx keeps notices going after the answer (NT-05)
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
  },
  /** BK-15: a mail to a trip's inbox address becomes a proposed booking; DB-23: one to its wish address a wish.
   * An unknown address, a full inbox, too many wishes in a day (DB-25) or a mail without a title is rejected. */
  async email(message: IncomingMail, env: WorkerEnv): Promise<void> {
    const r = await appFor(env).receive(await new Response(message.raw).arrayBuffer(), message.to); // BK-32: with the AI service
    if ("error" in r) message.setReject(REJECT[r.error]);
  },
};
