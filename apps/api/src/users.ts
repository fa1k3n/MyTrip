// User accounts: password hashes, password links and Google login (US-01..US-11). Web Crypto only, so it runs in the Worker and in Node.

/** An account (US-01). Only a hash of the password and of the password link's secret is kept (US-04, US-06). */
export type User = {
  id: string; name: string; email: string; superuser: boolean; disabled: boolean; ai: boolean; createdAt: string;
  passwordHash?: string; googleId?: string; lastLogin?: string; setup?: { hash: string; expires: string };
  consentAt?: string; // when the beta notice was accepted (US-26)
};
/** The Google OAuth client of the instance (US-10). */
export type Google = { clientId: string; clientSecret: string };
/** The Google client when both secrets are set; otherwise Google login is off (US-10). */
export const googleOf = (clientId?: string, clientSecret?: string): Google | undefined => (clientId && clientSecret ? { clientId, clientSecret } : undefined);

export const PASSWORD_MIN = 10, SETUP_DAYS = 7, ITERATIONS = 100_000; // 100 000 is the most the Worker's PBKDF2 allows (US-06)
const enc = new TextEncoder();
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const b64url = (b: Uint8Array) => b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const normEmail = (s: string) => s.trim().toLowerCase();
export const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}
/** A salted PBKDF2-SHA-256 hash as `pbkdf2-sha256$<iterations>$<salt>$<hash>` (US-06). */
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITERATIONS))}`;
}
export async function checkPassword(password: string, stored: string) {
  const [kind, n, salt, hash] = stored.split("$");
  if (kind !== "pbkdf2-sha256" || !n || !salt || !hash) return false;
  const got = await pbkdf2(password, unb64(salt), Number(n)), want = unb64(hash);
  let d = got.length ^ want.length;
  for (let i = 0; i < Math.min(got.length, want.length); i++) d |= got[i]! ^ want[i]!;
  return d === 0;
}
export const sha256 = async (s: string) => b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));

/** What the superuser's list shows of an account: never a hash (US-02). */
export const publicUser = ({ passwordHash, googleId, setup: _s, ...u }: User) => ({ ...u, password: !!passwordHash, google: !!googleId });

/** The first superuser, who owns what no one else does and whom the admin password acts as (US-13, US-18). */
export const firstSuper = (users: User[]) =>
  users.filter((u) => u.superuser && !u.disabled).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];

/** A user's roles in each trip they reach: owner (US-13), and the permission of a traveler tied to their address (US-21, US-22). */
export type Membership = { role: "admin" | "owner" | "traveler" | "planner"; roles: ("owner" | "traveler" | "planner")[]; travelerId?: string; owner?: string };
export function memberships(u: User, users: User[], trips: { id: string; travelers: { id: string }[] }[], owners: Record<string, string>,
  people: { tripId: string; travelerId: string; role: "traveler" | "planner"; account?: string }[]): Record<string, Membership> {
  const first = firstSuper(users)?.id, out: Record<string, Membership> = {};
  for (const t of trips) {
    const owner = owners[t.id] ?? first, own = owner === u.id;
    const tie = people.find((l) => l.tripId === t.id && l.account === u.email && t.travelers.some((x) => x.id === l.travelerId));
    if (!u.superuser && !own && !tie) continue;
    const roles: Membership["roles"] = [...(own ? ["owner" as const] : []), ...(tie ? [own ? "traveler" as const : tie.role] : [])];
    const ownerName = !own && u.superuser ? users.find((x) => x.id === owner)?.name : undefined;
    out[t.id] = { role: u.superuser ? "admin" : own ? "owner" : tie!.role, roles, ...(tie ? { travelerId: tie.travelerId } : {}), ...(ownerName ? { owner: ownerName } : {}) };
  }
  return out;
}

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth", TOKEN = "https://oauth2.googleapis.com/token";
/** A PKCE pair (US-09). */
export async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge: b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier)))) };
}
export const googleAuthUrl = (g: Google, redirect: string, state: string, challenge: string) => `${AUTH}?${new URLSearchParams({
  client_id: g.clientId, redirect_uri: redirect, response_type: "code", scope: "openid email", state,
  code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
})}`;
/** Exchanges the code with Google itself; the ID token comes straight from Google over TLS, so its claims are checked, not its
 * signature (OpenID Connect Core 3.1.3.7). Undefined when the answer is not a valid token for this client (US-09). */
export async function googleIdentity(g: Google, code: string, verifier: string, redirect: string, f: typeof fetch = fetch, now = Date.now()) {
  const r = await f(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({
    code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: redirect, grant_type: "authorization_code", code_verifier: verifier,
  }).toString() }).catch(() => undefined);
  const token = r?.ok ? ((await r.json().catch(() => ({}))) as { id_token?: unknown }).id_token : undefined;
  if (typeof token !== "string") return undefined;
  let c: { iss?: unknown; aud?: unknown; exp?: unknown; sub?: unknown; email?: unknown; email_verified?: unknown };
  try { c = JSON.parse(new TextDecoder().decode(unb64(token.split(".")[1] ?? ""))); } catch { return undefined; }
  const ok = (c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com") && c.aud === g.clientId
    && typeof c.exp === "number" && c.exp * 1000 > now && typeof c.sub === "string" && typeof c.email === "string";
  return ok ? { sub: c.sub as string, email: normEmail(c.email as string), verified: c.email_verified === true } : undefined;
}
