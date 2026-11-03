// DP-13: on a test instance the AI answers are recorded and replayed, so the user tests cost nothing when nothing changed.
// Dates count from the request's <today>, so a test set up on another day with the same relative dates replays too.
import type { AiCall } from "./ai.ts";
import { sha256 } from "./users.ts";

/** Where the recorded answers are kept: the table ai_replay on the Worker. */
export type ReplayKv = { get(key: string): Promise<string | undefined>; put(key: string, value: string): Promise<void> };

const DAY = 864e5, ISO = /\b\d{4}-\d\d-\d\d\b/g;
const todayOf = (json: string) => /<today>(\d{4}-\d\d-\d\d)<\/today>/.exec(json)?.[1];
/** Every date as days from today, "D21", so the key is the same on another day. */
const relative = (json: string, today: string) => json.replace(ISO, (d) => `D${Math.round((Date.parse(d) - Date.parse(today)) / DAY)}`);
/** Every date moved by a number of days. */
const moved = (json: string, days: number) => (days ? json.replace(ISO, (d) => (Number.isNaN(Date.parse(d)) ? d : new Date(Date.parse(d) + days * DAY).toISOString().slice(0, 10))) : json);
const FREE = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 0 } };

/** The AI service with record and replay when `flag` is "1" (the Worker's AI_REPLAY), else the service itself. */
export function withReplay(call: AiCall, flag: string | undefined, kv: ReplayKv): AiCall {
  if (flag !== "1") return call;
  return async (req) => {
    const json = JSON.stringify(req), today = todayOf(json);
    const key = await sha256(today ? relative(json, today) : json);
    const kept = await kv.get(key);
    if (kept) {
      const { today: then, message } = JSON.parse(kept) as { today?: string; message: unknown };
      const days = today && then ? Math.round((Date.parse(today) - Date.parse(then)) / DAY) : 0;
      const m = JSON.parse(moved(JSON.stringify(message), days)) as Awaited<ReturnType<AiCall>>;
      return { ...m, usage: { ...m.usage, ...FREE } } as Awaited<ReturnType<AiCall>>;
    }
    const m = await call(req);
    await kv.put(key, JSON.stringify({ today, message: m }));
    return m;
  };
}
